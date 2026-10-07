# Export API

Bulk-export conversation history and documents from a chatbot. The same exports are available in the UI — see [Analysis & exports](../building/analysis-exports.md).

Exports are produced by the Flask backend. The web app exposes three of them behind a signed-in session; these are the routes the UI itself calls. There is no API-key form of the export routes. If you run the stack yourself and have exposed the backend, you can call its endpoints directly (below).

Every export shares the same behaviour:

- **Up to 500 items** — a `.zip` is returned directly as a download.
- **More than 500 items** — the export runs in the background and the response says so immediately. When it finishes, the zip is uploaded to object storage and a download link (valid 48 hours) is emailed to the recipients listed per endpoint — **only if the backend has the SMTP variables** from the [Configuration reference](../self-hosting/configuration.md). Without them the export still reaches object storage and nothing is sent.
- **No data** — HTTP `204 No Content`.

## From a signed-in session

All three are `GET` requests that need the Keycloak session cookie (`access_token`) the browser holds after sign-in; calls without one get `401`.

| Route | Who can call it | What you get |
| --- | --- | --- |
| `/api/UIUC-api/downloadConvoHistory?course_name=<chatbot>` | Owner or administrator | Every conversation in the chatbot as `<first 10 characters>-convos.zip`: `markdown export/` (one file per conversation), `media_files/`, an `.xlsx`, a `.jsonl` (see [Data format](../building/analysis-exports.md#data-format)) and `error.log`. Over 500 conversations: `{"message": "..."}` and the email path. |
| `/api/UIUC-api/exportAllDocuments?course_name=<chatbot>` | Owner or administrator | The post-processed text and embeddings of every document as `<chatbot>_documents.zip` holding one `.jsonl`. Over 500 documents: `{"message": "...", "s3_path": "..."}` and the email path. |
| `/api/UIUC-api/downloadConvoHistoryUser?projectName=<chatbot>` | Any user with access to the chatbot | The signed-in user's own conversations (the address comes from the session) as a zip of Markdown files plus media. Over 500 conversations: the email path, to that user. The route waits up to five minutes and returns `504` after that. |

None of the three takes a date range. From a page served by the app:

```javascript
const response = await fetch(
  "/api/UIUC-api/downloadConvoHistory?course_name=ece-385",
);
if (response.headers.get("content-type") === "application/zip") {
  const blob = await response.blob(); // save it
} else {
  console.log(await response.json()); // background export started
}
```

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
