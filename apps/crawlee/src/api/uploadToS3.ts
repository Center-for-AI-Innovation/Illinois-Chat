// upload.ts
import * as path from 'path';
import axios from 'axios';
import { Log, log as rootLog } from 'crawlee';
import { oneLine } from '../logSetup.js';
import { S3Client, PutObjectCommand, HeadObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

function createS3Client(): S3Client {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_KEY
  const secretAccessKey = process.env.AWS_SECRET

  const baseConfig: any = region
    ? { region }
    : {}

  if (accessKeyId && secretAccessKey) {
    baseConfig.credentials = { accessKeyId, secretAccessKey }
  }

  // MinIO override (local dev)
  if (process.env.MINIO_ENDPOINT) {
    baseConfig.endpoint = process.env.MINIO_ENDPOINT
    baseConfig.forcePathStyle = true
  }

  return new S3Client(baseConfig)
}

const s3BucketName = process.env.S3_BUCKET_NAME
if (!s3BucketName) {
  rootLog.error('S3_BUCKET_NAME is not set, so PDF uploads will fail.')
}

// Upload PDF to S3 and send the S3 path to the ingest function.
// Returns the S3 key, or null when the URL did not actually serve a PDF (so the caller
// can skip ingest instead of pushing a broken document into the pipeline).
export async function uploadPdfToS3(url: string, courseName: string, clog: Log = rootLog): Promise<string | null> {
  const s3Client = createS3Client()

  // Sanitize filename
  const humanURI = decodeURI(path.basename(url));
  const extension = path.extname(humanURI);
  const nameWithoutExtension = path.basename(humanURI, extension);
  const filename = nameWithoutExtension.replace(/[^a-zA-Z0-9]/g, '-') + extension;

  // Download FIRST and verify it's actually a PDF before doing any S3 work. Many ".pdf"
  // URLs now 301-redirect to an HTML page (sites migrated off PDFs); axios follows the
  // redirect and returns HTML, which we'd otherwise upload as a broken "PDF" that the
  // worker can't open ("cannot open broken document"), burning ~40s/each on retries.
  clog.debug(`Fetching candidate PDF. Filename: ${filename}, Url: ${url}`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const pdfBuffer = response.data;
  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  const head = Buffer.from(pdfBuffer).subarray(0, 5).toString('latin1');
  if (!contentType.includes('application/pdf') && head !== '%PDF-') {
    clog.warning(`SKIP-PDF (not-a-pdf, content-type=${contentType || 'n/a'}): url=${url}`);
    return null;
  }

  clog.debug(`Uploading PDF to S3. Filename: ${filename}, Url: ${url}`);

  // Check if the bucket exists, and create it if it does not
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: s3BucketName }));
    clog.debug(`Bucket ${s3BucketName} already exists.`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotFound') {
        clog.debug(`Bucket ${s3BucketName} does not exist. Creating bucket.`);
        try {
          await s3Client.send(new CreateBucketCommand({ Bucket: s3BucketName }));
          clog.debug(`Bucket ${s3BucketName} created.`);
        } catch (createError) {
          if (createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou') {
            clog.debug(`Bucket ${s3BucketName} already owned by you.`);
          } else {
            throw createError;
          }
        }
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const s3Key = `courses/${courseName}/${filename}`;

  // Dedup across crawls: a popular PDF (e.g. a site-wide handbook) is linked from many pages,
  // so many separate crawl jobs target the SAME s3 key. Without dedup, the duplicate ingest
  // jobs race the worker's duplicate-handling — which deletes the S3 object to "replace" it —
  // so the sibling jobs' download 404s ("Error in /ingest: bulk_ingest: HeadObject 404") and
  // the PDF fails. If the object already exists, an earlier crawl already uploaded + ingested
  // it, so skip ingest (return null) instead of enqueuing a duplicate job.
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
    clog.debug(`SKIP-PDF (dup, already in S3): key=${s3Key}, url=${url}`);
    return null;
  } catch (headErr) {
    // NotFound → first crawl to see this PDF; fall through to upload + ingest.
  }

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: pdfBuffer,
    }));
    clog.debug(`PDF uploaded to S3 at key: ${s3Key}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchBucket') {
      clog.debug(`Bucket ${s3BucketName} does not exist. Creating bucket.`);
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: s3BucketName }));
        clog.debug(`Bucket ${s3BucketName} created.`);
        // Retry the upload after creating the bucket
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: s3Key,
          Body: pdfBuffer,
        }));
        clog.debug(`PDF uploaded to S3 at key: ${s3Key}`);
      } catch (createError) {
        if (createError instanceof Error && createError.name === 'BucketAlreadyOwnedByYou') {
          clog.debug(`Bucket ${s3BucketName} already owned by you.`);
          // Retry the upload after confirming the bucket is owned by you
          await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: pdfBuffer,
          }));
          clog.debug(`PDF uploaded to S3 at key: ${s3Key}`);
        } else {
          throw createError;
        }
      }
    } else {
      throw error;
    }
  }

  return s3Key;
}

export async function ingestPdf(s3Key: string, courseName: string, base_url: string, url: string, documentGroups: string[], clog: Log = rootLog, requestId?: string) {
  const ingestUrl = process.env.INGEST_URL;
  if (!ingestUrl) {
    clog.error('INGEST_URL is not set, so the PDF cannot be sent to ingest.');
    return;
  }

  try {
    fetch(ingestUrl, {
      "method": "POST",
      "headers": {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        ...(requestId ? { "X-Request-ID": requestId } : {}),
      },
      "body": JSON.stringify({
        base_url: base_url,
        url: url,
        readable_filename: path.basename(s3Key),
        s3_paths: s3Key,
        course_name: courseName,
        groups: documentGroups,
      })
    })
      .then(async response => {
        const text = await response.text();
        if (!response.ok) {
          clog.error(`PDF ingest request failed url=${url} key=${s3Key} status=${response.status} body=${oneLine(text.slice(0, 500))}`);
        }
      })
      .catch(err => clog.error(`PDF ingest request failed url=${url} key=${s3Key}: ${oneLine(err)}` + (err?.cause ? ` (cause: ${oneLine(err.cause)})` : '')));
  } catch (error) {
    // Only reached if fetch() throws before sending (for example an invalid INGEST_URL).
    clog.error(`Could not send PDF ingest request url=${url} key=${s3Key}: ${oneLine(error)}`);
  }
}
