# Ingest API

Add documents to a chatbot programmatically. Ingest is asynchronous: requests are queued and processed by the ingest worker, and each call returns a job ID. These endpoints are served by the Flask backend, which has no authentication of its own — see the note on the [API Reference](index.md) page.

## `POST /ingest`

Queues one ingest job. The body is passed to the worker as-is; the fields it reads are:

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Chatbot name. |
| `s3_paths` | string or array | for files | Object-storage key(s) of files already uploaded, e.g. `courses/<chatbot>/<file>`. |
| `readable_filename` | string | yes, in practice | Name shown on the Dashboard and in citations; without it the document appears unnamed. |
| `groups` | array | no | [Document groups](../building/dashboard/document-groups.md) to assign. |
| `url` | string | no | Source URL stored as metadata and used for citation links. On its own it ingests nothing. |
| `base_url` | string | no | Site the page was crawled from; stored as metadata. |
| `content` | string | no | Page text to ingest directly (how the web crawler submits HTML pages). |
| `force_embeddings` | boolean | no | Re-ingest even when the content is an exact duplicate. Default `false`. |

### Response

```json
{
  "outcome": "Queued Ingest task",
  "task_id": "…"
}
```

### Ingesting a file

File ingestion is a three-step flow — the file goes straight from your client to object storage, bypassing the application servers:

1. **Get a presigned upload** for your chatbot. The web app does this through its own route `/api/UIUC-api/uploadToS3`, which needs a browser session cookie, so from a script you either use the object store's credentials directly or run the upload from a signed-in browser.
2. **`POST` the file** to the presigned URL with the returned form fields (a presigned POST, not a `PUT`).
3. **Call `/ingest`** with the resulting object key:

```bash
curl -X POST https://<your-backend-host>/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "your-chatbot-name",
    "s3_paths": ["courses/your-chatbot-name/lecture-01.pdf"],
    "readable_filename": "Lecture 1 – Introduction.pdf",
    "groups": ["lectures"]
  }'
```

## Canvas ingest

```
POST /canvas_ingest
```

Bulk-import a Canvas course. The platform's Canvas account must be enrolled in the course — see [Importing](../building/dashboard/importing.md). The backend needs `CANVAS_ACCESS_TOKEN` set (see the [Configuration reference](../self-hosting/configuration.md)); without it the endpoint returns `500`.

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Chatbot name. |
| `canvas_url` | string | yes | Canvas course URL. The course ID is taken from `canvas.illinois.edu/courses/<id>`; other Canvas hosts are not recognised. |
| `files` | boolean | no | Import course files. Default `true`. |
| `pages` | boolean | no | Import pages. Default `true`. |
| `modules` | boolean | no | Import modules. Default `true`. |
| `syllabus` | boolean | no | Import the syllabus. Default `true`. |
| `assignments` | boolean | no | Import assignments. Default `true`. |
| `discussions` | boolean | no | Import discussions. Default `true`. |

### Example

```bash
curl -X POST https://<your-backend-host>/canvas_ingest \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "your-chatbot-name",
    "canvas_url": "https://canvas.illinois.edu/courses/12345",
    "files": true,
    "pages": true,
    "modules": false,
    "syllabus": true,
    "assignments": false,
    "discussions": false
  }'
```

### Response

Each downloaded file is queued as its own ingest job:

```json
{
  "outcome": "Queued Canvas Ingest task",
  "ingest_task_ids": ["…", "…"]
}
```
