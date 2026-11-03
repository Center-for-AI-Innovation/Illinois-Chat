import os
import re
import uuid
import shutil
import logging
import requests
from typing import Dict, List, Tuple
from urllib.parse import urlsplit
from dotenv import load_dotenv

import boto3
from botocore.config import Config
import sentry_sdk
from canvasapi import Canvas

import yt_dlp
from bs4 import BeautifulSoup

from ai_ta_backend.rabbitmq.rmqueue import Queue


load_dotenv()

logger = logging.getLogger(__name__)

# Canvas file links carry a `verifier=` secret in the query string. Never log it.
_QUERY_STRING = re.compile(r'\?[^\s\'")]+')


def _strip_query(text: str) -> str:
    return _QUERY_STRING.sub('?***', text)


def _request_error(e: Exception) -> str:
    """`ConnectionError: ...` for a requests failure, without URL query strings.
    Log this instead of the traceback: the urllib3 chain repeats the full URL."""
    return _strip_query(f"{type(e).__name__}: {e}")


def _failed(e: Exception) -> str:
    """The failure string a section returns, without URL query strings."""
    return "Failed! Error: " + _strip_query(str(e))


class CanvasError(Exception):
    """A Canvas call failed.

    `message` is what the user sees. `upstream_status` and `upstream_message` are
    what Canvas answered (status code, start of the reply), `path` is the URL path
    that was called, without the query string.
    """

    def __init__(self, message, upstream_status=None, upstream_message=None, path=None):
        super().__init__(message)
        self.message = message
        self.upstream_status = upstream_status
        self.upstream_message = upstream_message
        self.path = path

    def describe(self) -> str:
        """`Canvas 401 for /api/v1/users/self`, or `Canvas unreachable for ...`."""
        if self.upstream_status is not None:
            return f"Canvas {self.upstream_status} for {self.path}"
        if self.path is not None:
            return f"Canvas unreachable for {self.path}"
        return self.message


class IngestCanvas:
    """
    Class for ingesting documents into the vector database.
    """

    def __init__(self):
        self.canvas_url = "https://canvas.illinois.edu"
        self.canvas_access_token = os.getenv('CANVAS_ACCESS_TOKEN')
        self.headers = {"Authorization": f"Bearer {self.canvas_access_token}"}
        self.volume_path = "./canvas_ingest"
        self.minio_url = os.getenv('MINIO_URL')
        self.aws_access_key_id = os.getenv('AWS_ACCESS_KEY_ID')
        self.aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY')

        self.s3_client = None
        self.canvas_client = None

    def initialize_resources(self):
        # Connect to AWS S3 file store
        if self.aws_access_key_id and self.aws_secret_access_key:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.minio_url,
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                config=Config(s3={'addressing_style': 'path'}),
            )
        else:
            logger.info("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY unset, connecting to S3 without credentials")
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.minio_url,
                config=Config(s3={'addressing_style': 'path'})
            )

        self.canvas_client = Canvas(self.canvas_url, self.canvas_access_token)

    def _canvas_request(self, method, url, params=None, json=None) -> requests.Response:
        """Call the Canvas API with the access token. Raises CanvasError on a
        non-2xx reply or when Canvas cannot be reached. Does not log."""
        path = urlsplit(url).path
        try:
            response = requests.request(method, url, headers=self.headers, params=params, json=json, timeout=30)
            response.raise_for_status()
            return response
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            body = e.response.text[:500] if e.response is not None else None
            raise CanvasError("Canvas request failed", status, body, path) from e
        except requests.RequestException as e:
            raise CanvasError("Canvas unreachable", None, _request_error(e), path) from e

    def auto_accept_enrollments(self, target_course_id):
        """Accept the pending Canvas invitation of the token's user for the course.

        Returns normally when the user is enrolled. Raises CanvasError when Canvas
        refuses or the enrollment cannot be accepted.
        """
        try:
            # Validate target_course_id
            if target_course_id is None:
                raise CanvasError("Canvas enrollment failed: no Canvas course id")
            user_response = self._canvas_request('GET', f"{self.canvas_url}/api/v1/users/self")
            user_data = user_response.json()
            user_id = user_data.get('id')

            if not user_id:
                raise CanvasError("Canvas enrollment failed: /users/self returned no id")

            # First, check if user is already enrolled in the target course
            current_enrollments_url = f"{self.canvas_url}/api/v1/users/{user_id}/enrollments?state[]=active"
            current_enrollment_response = self._canvas_request('GET', current_enrollments_url)
            current_enrollments = current_enrollment_response.json()

            # Check if already enrolled in target course
            for enrollment in current_enrollments:
                course_id = enrollment.get('course_id')
                if str(course_id) == str(target_course_id):
                    logger.info("Canvas user already enrolled canvas_course_id=%s", target_course_id)
                    return f"User is already enrolled in course ID {target_course_id}"

            # If not already enrolled, check for pending invitations
            enrollments_url = f"{self.canvas_url}/api/v1/users/{user_id}/enrollments?state[]=invited"
            enrollment_response = self._canvas_request('GET', enrollments_url)
            pending_enrollments = enrollment_response.json()

            # Find the enrollment for the target course
            target_enrollment = None
            for enrollment in pending_enrollments:
                course_id = enrollment.get('course_id')
                if str(course_id) == str(target_course_id):
                    target_enrollment = enrollment
                    break

            # If no enrollment found for the target course, throw error
            if not target_enrollment:
                raise CanvasError(
                    f"Canvas enrollment failed: no pending invitation for Canvas course {target_course_id}")

            # Accept the enrollment for the target course
            course_id = target_enrollment.get('course_id')
            enrollment_id = target_enrollment.get('id')

            if not course_id or not enrollment_id:
                error_msg = f"Missing course_id or enrollment_id in enrollment data (keys: {sorted(target_enrollment)})"
                raise Exception(error_msg)

            accept_url = f"{self.canvas_url}/api/v1/courses/{course_id}/enrollments/{enrollment_id}/accept"
            try:
                accept_response = self._canvas_request('POST', accept_url)
            except CanvasError as e:
                if e.upstream_status is None:
                    raise
                raise CanvasError(f"Canvas enrollment failed: accept returned {e.upstream_status}", e.upstream_status,
                                  e.upstream_message, e.path) from e

            result = accept_response.json()
            if result.get('success'):
                logger.info("accepted Canvas enrollment canvas_course_id=%s", course_id)
                return f"Successfully accepted enrollment for course ID {course_id}"
            raise CanvasError(f"Canvas enrollment failed: accept returned {accept_response.status_code}",
                              accept_response.status_code, accept_response.text[:500], urlsplit(accept_url).path)

        except CanvasError as e:
            if e.path and e.path.endswith('/users/self') and e.upstream_status in (401, 403):
                error = CanvasError("Canvas rejected the configured access token", e.upstream_status,
                                    e.upstream_message, e.path)
            else:
                error = e
            if error.upstream_message is not None:
                logger.error("%s: %s", error.describe(), error.upstream_message)
            else:
                logger.error("%s", error.describe())
            if error is e:
                raise
            raise error from e
        except Exception as e:
            sentry_sdk.capture_exception(e)
            raise

    def upload_file(self, file_path: str, bucket_name: str, object_name: str):
        self.s3_client.upload_file(file_path, bucket_name, object_name)

    def add_users(self, canvas_course_id: str, course_name: str):
        """
            Get all users in a course by course ID and add them to uiuc.chat course
            - Student profile does not have access to emails.
            - Currently collecting all names in a list.
            """
        try:
            course = self.canvas_client.get_course(canvas_course_id)
            users = course.get_users()
            user_names = (user['name'] for user in users)
            logger.debug("collected Canvas user names canvas_course_id=%s", canvas_course_id)

            # TODO: This doesn't do anything... getting names but not emails?

            return len(user_names) > 0
        except Exception as e:
            logger.exception("listing Canvas users failed course=%s canvas_course_id=%s", course_name, canvas_course_id)
            sentry_sdk.capture_exception(e)
            return "Failed to `add users`! Error: " + str(e)

    def download_course_content(self, canvas_course_id: int, dest_folder: str,
                                content_ingest_dict: dict) -> Dict[str, str]:
        """Downloads all Canvas course materials through the course ID and stores in local directory.

        Returns the result of each section: "Success", "Failed! ...", or "skipped"
        when the section was not selected.
        """
        self.initialize_resources()
        api_path = f"{self.canvas_url}/api/v1/courses/{canvas_course_id}"

        downloaders = {
            'files': self.download_files,
            'pages': self.download_pages,
            'modules': self.download_modules,
            'syllabus': self.download_syllabus,
            'assignments': self.download_assignments,
            'discussions': self.download_discussions,
        }
        section_results: Dict[str, str] = {}
        for section, download in downloaders.items():
            if content_ingest_dict.get(section) is True:
                section_results[section] = download(dest_folder, api_path)
            else:
                section_results[section] = "skipped"

        extracted_urls_from_html = self.extract_urls_from_html(dest_folder)

        # links - canvas files, external urls, embedded videos
        file_links = extracted_urls_from_html.get('file_links', [])
        if file_links:
            section_results['file_links'] = self.download_files_from_urls(file_links, canvas_course_id, dest_folder)
        else:
            section_results['file_links'] = "none found"

        video_links = extracted_urls_from_html.get('video_links', [])
        if video_links:
            section_results['video_links'] = self.download_videos_from_urls(video_links, canvas_course_id, dest_folder)
        else:
            section_results['video_links'] = "none found"

        data_api_endpoints = extracted_urls_from_html.get('data_api_endpoints', [])
        if data_api_endpoints:
            section_results['data_api_endpoints'] = self.download_content_from_api_endpoints(
                data_api_endpoints, canvas_course_id, dest_folder)
        else:
            section_results['data_api_endpoints'] = "none found"

        logger.info("Canvas download done canvas_course_id=%s results=%s", canvas_course_id, section_results)
        return section_results

    def ingest_course_content(self,
                              canvas_course_id: int,
                              course_name: str,
                              content_ingest_dict: Dict[str, bool] = None) -> Tuple[List[str], Dict[str, str]]:
        """
        Ingests all Canvas course materials through the course ID.

        Returns the queued job ids and the result of each section.
        """
        if content_ingest_dict is None:
            content_ingest_dict = {
                'files': True,
                'pages': True,
                'modules': True,
                'syllabus': True,
                'assignments': True,
                'discussions': True
            }

        bucket_name = os.environ.get('S3_BUCKET_NAME')
        if not bucket_name:
            raise ValueError("Canvas ingest needs S3_BUCKET_NAME, which is unset")

        # Create a canvas directory with a course folder inside it.
        canvas_dir = os.path.join(self.volume_path, "canvas_materials")
        folder_name = f"canvas_course_{canvas_course_id}_ingest"
        folder_path = os.path.join(canvas_dir, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        section_results = self.download_course_content(canvas_course_id, folder_path, content_ingest_dict)

        # Upload files to S3
        all_file_paths = [os.path.join(dp, f) for dp, dn, filenames in os.walk(folder_path) for f in filenames]
        all_s3_paths = []
        all_readable_filenames = []
        for file_path in all_file_paths:
            file_name = os.path.basename(file_path)
            extension = os.path.splitext(file_name)[1]
            name_without_extension = re.sub(r'[^a-zA-Z0-9]', '-', os.path.splitext(file_name)[0])
            readable_filename = f"{name_without_extension}{extension}"
            uid = uuid.uuid4()

            unique_filename = f"{uid}-{readable_filename}"
            s3_path = f"courses/{course_name}/{unique_filename}"
            all_s3_paths.append(s3_path)
            all_readable_filenames.append(readable_filename)
            logger.debug("uploading Canvas file %s to %s", readable_filename, s3_path)
            self.upload_file(file_path, bucket_name, s3_path)

        shutil.rmtree(folder_path)

        # Ingest files
        job_ids = []
        active_queue = Queue()  # TODO: Should we post back to /ingest endpoint here?
        for s3_path, readable_filename in zip(all_s3_paths, all_readable_filenames):
            data = {
                'course_name': course_name,
                'readable_filename': readable_filename,
                's3_paths': [s3_path],
                'base_url': f"{self.canvas_url}/courses/{canvas_course_id}",
            }
            job_id = active_queue.addJobToIngestQueue(data)
            logger.debug("queued Canvas file %s job=%s", readable_filename, job_id)
            job_ids.append(job_id)

        logger.info("queued %d jobs for course=%s canvas_course_id=%s", len(job_ids), course_name, canvas_course_id)
        return job_ids, section_results

    def download_files(self, dest_folder: str, api_path: str) -> str:
        """
        Downloads all files in a Canvas course into given folder.
        """
        try:
            files_request = self._canvas_request('GET', f"{api_path}/files")
            files = files_request.json()

            downloaded = skipped = 0
            for f in files:
                try:
                    logger.debug("downloading Canvas file %s", f['filename'])
                    full_path = os.path.join(dest_folder, f['filename'])
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    try:
                        response = self._canvas_request('GET', f['url'])
                    except CanvasError as e:
                        logger.debug("item skipped: %s", e.describe())
                        skipped += 1
                        continue
                    with open(full_path, 'wb') as dest:
                        dest.write(response.content)
                    downloaded += 1
                except Exception as e:
                    logger.exception("downloading Canvas file %s failed", f.get('filename'))
                    sentry_sdk.capture_exception(e)
                    skipped += 1
                    continue
            logger.info("section=files downloaded=%d skipped=%d", downloaded, skipped)
            return "Success"
        except CanvasError as e:
            logger.warning("section=files skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except Exception as e:
            logger.exception("section=files failed for %s", urlsplit(api_path).path)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_pages(self, dest_folder: str, api_path: str) -> str:
        """
        Downloads all pages as HTML and stores them in given folder.
        """
        try:
            pages_request = self._canvas_request('GET', f"{api_path}/pages")
            pages = pages_request.json()

            downloaded = skipped = 0
            for page in pages:
                if 'published' in page and not page['published']:
                    logger.debug("page not published: %s", page['title'])
                    continue
                if 'hide_from_students' in page and page['hide_from_students']:
                    logger.debug("page hidden from students: %s", page['title'])
                    continue
                # page is visible to students
                if page['html_url'] != '':
                    try:
                        page_content_request = self._canvas_request('GET', f"{api_path}/pages/{page['page_id']}")
                    except CanvasError as e:
                        logger.debug("item skipped: %s", e.describe())
                        skipped += 1
                        continue
                    page_body = page_content_request.json()['body']
                    with open(f"{dest_folder}/{page['url']}.html", 'w') as html_file:
                        html_file.write(page_body)
                    downloaded += 1
            logger.info("section=pages downloaded=%d skipped=%d", downloaded, skipped)
            return "Success"
        except CanvasError as e:
            logger.warning("section=pages skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except Exception as e:
            logger.exception("section=pages failed for %s", urlsplit(api_path).path)
            return _failed(e)

    def download_syllabus(self, dest_folder: str, api_path: str) -> str:
        """
        Downloads syllabus as HTML and stores in given folder.
        """
        try:
            course_settings_request = self._canvas_request('GET', f"{api_path}?include=syllabus_body")
            syllabus_body = course_settings_request.json()['syllabus_body']
            with open(f"{dest_folder}/syllabus.html", 'w') as html_file:
                html_file.write(syllabus_body)
            logger.info("section=syllabus downloaded=1")
            return "Success"
        except CanvasError as e:
            logger.warning("section=syllabus skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except Exception as e:
            logger.exception("section=syllabus failed for %s", urlsplit(api_path).path)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_modules(self, dest_folder: str, api_path: str) -> str:
        """
        Downloads all content uploaded in modules.
        Modules may contain: assignments, quizzes, files, pages, discussions, external tools and external urls.
        Rest of the things are covered in other functions.
        """
        external_url = None
        try:
            module_request = self._canvas_request('GET', f"{api_path}/modules?include=items&per_page=50")
            modules = module_request.json()
            downloaded = skipped = 0
            for module in modules:
                if 'published' in module and not module['published']:
                    logger.debug("module not published: %s", module['name'])
                    continue

                module_number = str(module['position'])
                logger.debug("downloading module %s", module_number)
                for item in module['items']:

                    if item['type'] == 'ExternalUrl':
                        external_url = item['external_url']
                        response = requests.get(external_url, timeout=30)
                        if response.status_code == 200:
                            title_fmt = item['title'].replace(' ', '_')
                            html_file_name = f"Module_{module_number}_external_link_{title_fmt}.html"
                            with open(f"{dest_folder}/{html_file_name}", 'w') as html_file:
                                html_file.write(response.text)
                            downloaded += 1

                    elif item['type'] == 'Discussion':
                        try:
                            discussion_req = self._canvas_request('GET', item['url'])
                        except CanvasError as e:
                            logger.debug("item skipped: %s", e.describe())
                            skipped += 1
                            continue
                        discussion_data = discussion_req.json()
                        title_fmt = discussion_data['title'].replace(" ", "_")
                        discussion_filename = f"Module_{module_number}_Discussion_{title_fmt}.html"
                        with open(f"{dest_folder}/{discussion_filename}", 'w') as html_file:
                            html_file.write(discussion_data['message'])
                        downloaded += 1

                    elif item['type'] in ['Assignment', 'Quiz']:
                        # Assignments are handled separately
                        # Quizzes are not handled yet
                        continue

                    else:  # OTHER ITEMS - PAGES
                        if 'url' not in item:
                            continue

                        item_url = item['url']
                        try:
                            item_request = self._canvas_request('GET', item_url)
                        except CanvasError as e:
                            logger.debug("item skipped: %s", e.describe())
                            skipped += 1
                            continue
                        item_data = item_request.json()
                        if 'published' in item_data and not item_data['published']:
                            logger.debug("item not published: %s", item_data['url'])
                            continue
                        if 'body' not in item_data:
                            continue

                        item_body = item_data['body']
                        html_file_name = f"Module_{module_number}_{item['type']}_{item_data['url']}.html"
                        with open(f"{dest_folder}/{html_file_name}", 'w') as html_file:
                            html_file.write(item_body)
                        downloaded += 1
            logger.info("section=modules downloaded=%d skipped=%d", downloaded, skipped)
            return "Success"
        except CanvasError as e:
            logger.warning("section=modules skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except requests.RequestException as e:
            logger.error("section=modules failed for %s url=%s: %s", urlsplit(api_path).path,
                         urlsplit(external_url).path if external_url else None, _request_error(e))
            sentry_sdk.capture_exception(e)
            return _failed(e)
        except Exception as e:
            logger.exception("section=modules failed for %s", urlsplit(api_path).path)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_assignments(self, dest_folder: str, api_path: str) -> str:
        """
        The description attribute has the assignment content in HTML format. Access that and store it as an HTML file.
        """
        try:
            assignment_request = self._canvas_request('GET', f"{api_path}/assignments")
            assignments = assignment_request.json()
            downloaded = 0
            for assignment in assignments:
                if 'published' in assignment and not assignment['published']:
                    logger.debug("assignment not published: %s", assignment['name'])
                    continue

                if assignment['description'] is not None and assignment['description'] != "":
                    assignment_name = f"assignment_{assignment['id']}.html"
                    with open(f"{dest_folder}/{assignment_name}", 'w') as html_file:
                        html_file.write(assignment['description'])
                    downloaded += 1
            logger.info("section=assignments downloaded=%d", downloaded)
            return "Success"
        except CanvasError as e:
            logger.warning("section=assignments skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except Exception as e:
            logger.exception("section=assignments failed for %s", urlsplit(api_path).path)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_discussions(self, dest_folder: str, api_path: str) -> str:
        """
        Download course discussions as HTML and store in given folder.
        """
        try:
            discussion_request = self._canvas_request('GET', f"{api_path}/discussion_topics")
            discussions = discussion_request.json()
            downloaded = 0
            for discussion in discussions:
                if 'published' in discussion and not discussion['published']:
                    logger.debug("discussion not published: %s", discussion['title'])
                    continue

                with open(f"{dest_folder}/{discussion['title']}.html", 'w') as html_file:
                    html_file.write(discussion['message'])
                downloaded += 1
            logger.info("section=discussions downloaded=%d", downloaded)
            return "Success"
        except CanvasError as e:
            logger.warning("section=discussions skipped: %s", e.describe())
            return "Failed! " + e.describe()
        except Exception as e:
            logger.exception("section=discussions failed for %s", urlsplit(api_path).path)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def extract_urls_from_html(self, dir_path: str) -> Dict[str, List[str]]:
        """
        Extracts URLs from all HTML files in a directory.
        """
        try:
            file_links = []
            video_links = []
            external_links = []
            data_api_endpoints = []
            for file_name in os.listdir(dir_path):
                if file_name.endswith(".html"):
                    file_path = os.path.join(dir_path, file_name)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                            content = file.read()
                    except UnicodeDecodeError:
                        with open(file_path, 'r', encoding='latin-1') as file:
                            content = file.read()

                    soup = BeautifulSoup(content, 'html.parser')

                    # Extracting links from href attributes
                    href_links = soup.find_all('a', href=True)
                    for link in href_links:
                        data_api_endpoint = link.get('data-api-endpoint')
                        if data_api_endpoint:
                            data_api_endpoints.append(data_api_endpoint)

                        href = link['href']
                        if re.match(r'https://canvas\.illinois\.edu/courses/\d+/files/.*', href):
                            file_links.append(href)
                        else:
                            external_links.append(href)

                    # Extracting video links from src attributes
                    src_links = soup.find_all('iframe', src=True)
                    for link in src_links:
                        src = link['src']
                        if re.match(r'https://ensemble\.illinois\.edu/hapi/v1/contents/.*', src):
                            video_links.append(src)

            return {
                'file_links': list(set(file_links)),
                'video_links': list(set(video_links)),
                'data_api_endpoints': list(set(data_api_endpoints)),
            }

        except Exception as e:
            logger.exception("extracting links from Canvas pages failed dir=%s", dir_path)
            sentry_sdk.capture_exception(e)
            return {}

    def download_files_from_urls(self, urls: List[str], course_id: int, dir_path: str):
        """
        This function downloads files from a given Canvas course using the URLs provided.
        input: urls - list of URLs scraped from Canvas HTML pages.
        """
        url = None
        try:
            count = 0
            for url in urls:
                count += 1
                with requests.get(url, stream=True, timeout=30) as r:
                    content_disposition = r.headers.get('Content-Disposition')
                    if content_disposition is None:
                        continue

                    if 'filename=' in content_disposition:
                        filename = content_disposition.split('filename=')[1].strip('"')
                    else:
                        continue

                    file_path = os.path.join(dir_path, filename)
                    with open(file_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            f.write(chunk)
                    logger.debug("downloaded linked file %s", filename)
            return "Success"
        except requests.RequestException as e:
            logger.error("downloading linked Canvas files failed canvas_course_id=%s url=%s: %s", course_id,
                         urlsplit(url).path if url else None, _request_error(e))
            sentry_sdk.capture_exception(e)
            return _failed(e)
        except Exception as e:
            logger.exception("downloading linked Canvas files failed canvas_course_id=%s url=%s", course_id,
                             urlsplit(url).path if url else None)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_videos_from_urls(self, urls: List[str], course_id: int, dir_path: str):
        """
        This function downloads videos from a given Canvas course using the URLs provided.
        """
        url = None
        try:
            count = 0
            for url in urls:
                count += 1
                with requests.get(url, stream=True, timeout=30) as r:
                    ydl_opts = {
                        'outtmpl': f'{dir_path}/{course_id}_video_{count}.%(ext)s',  # Dynamic extension
                        'format': 'best',
                        'quiet': True,  # no progress lines in the backend log
                    }
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info_dict = ydl.extract_info(url, download=True)
                        ext = info_dict.get('ext', 'mp4')
                        filename = f"{course_id}_video_{count}.{ext}"
                    logger.debug("downloaded video %s", filename)
            return "Success"
        except requests.RequestException as e:
            logger.error("downloading Canvas videos failed canvas_course_id=%s url=%s: %s", course_id,
                         urlsplit(url).path if url else None, _request_error(e))
            sentry_sdk.capture_exception(e)
            return _failed(e)
        except Exception as e:
            logger.exception("downloading Canvas videos failed canvas_course_id=%s url=%s", course_id,
                             urlsplit(url).path if url else None)
            sentry_sdk.capture_exception(e)
            return _failed(e)

    def download_content_from_api_endpoints(self, api_endpoints: List[str], course_id: int, dir_path: str):
        """
        This function downloads files from given Canvas API endpoints. These API endpoints are extracted along with URLs from
        downloaded HTML files. Extracted as a fix because the main URLs don't always point to a downloadable attachment.
        These endpoints are mostly canvas file links of type - https://canvas.illinois.edu/api/v1/courses/46906/files/12785151
        """
        try:
            for endpoint in api_endpoints:
                try:
                    if re.match(r'https:\/\/canvas\.illinois\.edu\/api\/v1\/courses\/\d+\/files\/\d+', endpoint):
                        # it is a file endpoint!
                        try:
                            api_response = self._canvas_request('GET', endpoint)
                            file_data = api_response.json()
                            if 'published' in file_data and not file_data['published']:
                                continue

                            file_download = self._canvas_request('GET', file_data['url'])
                        except CanvasError as e:
                            logger.debug("item skipped: %s", e.describe())
                            continue
                        with open(os.path.join(dir_path, file_data['filename']), 'wb') as f:
                            f.write(file_download.content)
                        logger.debug("downloaded file %s", file_data['filename'])
                except Exception as e:
                    logger.exception("downloading file from Canvas API endpoint %s failed canvas_course_id=%s",
                                     urlsplit(endpoint).path, course_id)
                    sentry_sdk.capture_exception(e)
                    continue

            return "Success"
        except Exception as e:
            logger.exception("downloading files from Canvas API endpoints failed canvas_course_id=%s", course_id)
            sentry_sdk.capture_exception(e)
            return _failed(e)
