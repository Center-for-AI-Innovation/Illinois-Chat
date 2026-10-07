# Uploading Materials

Add documents to your project from the **Materials** page. Everything you add is chunked, embedded, and indexed automatically — see [Concepts → Documents](../../how-it-works/documents-ingest.md) for what happens under the hood.

## Supported formats

| Category | Formats |
| --- | --- |
| Documents | PDF, DOCX, PPTX, XLSX, CSV, TXT, HTML |
| Code | Python, JSON, and other text-based source files |
| Media | MP4 (and other video), PNG, JPG/JPEG, SRT |

The per-file size limit is **500 MB**.

!!! info "Videos are transcribed"
    Videos are transcribed automatically with Whisper. Expect roughly 5–10 minutes of processing for an hour-long lecture; the transcript becomes searchable, citable content.

## Upload methods

### Drag and drop

Drag files onto the Materials page (or click **Upload**). Files are uploaded directly from your browser to object storage via presigned URLs, then queued for ingest.

## Monitoring ingest

Each document on the Materials page shows its ingest status. Large files and crawls process asynchronously; failures are retried automatically with exponential backoff. Duplicate documents are detected by content and skipped — see [duplicate handling](../../how-it-works/documents-ingest.md#duplicate-handling).
