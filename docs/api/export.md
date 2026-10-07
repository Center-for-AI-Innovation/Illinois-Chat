# Export API

Bulk-export conversation history and documents from a chatbot. The same exports are available in the UI — see [Analysis & exports](../building/analysis-exports.md).

Exports are produced by the Flask backend. There is no API-key form of the export endpoints, and the web app's own download routes need a signed-in browser session, so they are not part of this API. If you run the stack yourself and have exposed the backend, you can call its endpoints directly.

Every export shares the same behaviour:

- **Up to 500 items** — a `.zip` is returned directly as a download.
- **More than 500 items** — the export runs in the background and the response says so immediately. When it finishes, the zip is uploaded to object storage and a download link (valid 48 hours) is emailed to the recipients listed per endpoint — **only if the backend has the SMTP variables** from the [Configuration reference](../self-hosting/configuration.md). Without them the export still reaches object storage and nothing is sent.
- **No data** — HTTP `204 No Content`.

## Backend endpoints

The Flask backend serves five `GET` endpoints. They have no authentication, are not published outside the Docker Compose stack, and the hosted site does not expose them; see the note on the [API Reference](index.md) page. `from_date` and `to_date` take ISO 8601 dates; `to_date` is extended to the end of that day. Over 500 items the response is `{"response": "Download from S3", "s3_path": "..."}`; a missing `course_name` is `400`.

| Endpoint | Parameters | Zip contents | Background email to |
| --- | --- | --- | --- |
| `/export-convo-history` | `course_name` (required), `from_date`, `to_date` | `markdown export/`, `media_files/`, `.xlsx`, `.jsonl`, `error.log` | Owner and administrators |
| `/export-convo-history-csv` | `course_name` (required), `from_date`, `to_date` | One `.jsonl` (one conversation per line), despite the name | Owner and administrators |
| `/export-conversations-custom` | `course_name` (required), `from_date`, `to_date`, `destination_emails_list` (repeatable) | One `.jsonl`, as `-csv` | The addresses in `destination_emails_list` |
| `/export-convo-history-user` | `user_email`, `project_name` (both required; note the parameter names) | Markdown files plus media | `user_email` |
| `/exportDocuments` | `course_name` (required), `from_date`, `to_date` | One `.jsonl` of post-processed text and embeddings | Owner and administrators |

```bash
curl -o convos.zip "https://<your-backend-host>/export-convo-history?course_name=ece-385&from_date=2026-01-01&to_date=2026-06-30"
curl -o documents.zip "https://<your-backend-host>/exportDocuments?course_name=ece-385"
curl "https://<your-backend-host>/export-conversations-custom?course_name=ece-385&destination_emails_list=a@example.edu&destination_emails_list=b@example.edu"
```

!!! note "Original files"
    Original files (PDFs, etc.) are downloaded per document from the Dashboard's Project Files table, not through these endpoints.
