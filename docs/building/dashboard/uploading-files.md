# Uploading Files

Add documents to your chatbot from the **Dashboard**. Everything you add is chunked, embedded, and indexed automatically — see [Documents & ingest](../../how-it-works/documents-ingest.md) for what happens under the hood.

## Supported formats

The **Upload materials** dropzone shows icons for PDF, Word, PowerPoint, Excel, images, code and text files; most text formats (Markdown, HTML, CSV, XML, SRT and VTT subtitles, source code) are accepted as well. Audio and video files are rejected.

## Uploading

Drag files onto **Upload materials** (or click it to pick files). Files are uploaded directly from your browser to object storage via presigned URLs, then queued for ingest.

## Monitoring ingest

Each document in **Project Files** shows its ingest status. Large files and crawls process asynchronously; failed jobs are retried automatically. Duplicate documents are detected by content and skipped — see [duplicate handling](../../how-it-works/documents-ingest.md#duplicate-handling).

Other ways to add content: [Web crawling](web-crawling.md) and [Importing](importing.md) from Canvas or GitHub.
