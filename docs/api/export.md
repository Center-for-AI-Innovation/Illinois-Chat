# Export API

Bulk-export conversation history and documents from a chatbot. These endpoints are served by the Flask backend, which has no authentication of its own — see the note on the [API Reference](index.md) page. The same exports are available in the UI — see [Analysis & exports](../building/analysis-exports.md).

All export endpoints are `GET` requests and share the same response behaviour:

- **Up to 500 items** — a `.zip` is returned directly as a download.
- **More than 500 items** — the response is `{"response": "Download from S3", "s3_path": "…"}` immediately, and the export runs in the background. When it finishes, the zip is uploaded to object storage at `s3_path` and a download link (valid 48 hours) is emailed to the recipients listed per endpoint below — **only if the backend has the SMTP variables** from the [Configuration reference](../self-hosting/configuration.md). Without them the export still reaches object storage and nothing is sent.
- **No data** — HTTP `204 No Content`.

## `GET /export-convo-history`

Every conversation in the chatbot. The zip holds `markdown export/` (one file per conversation), `media_files/`, an `.xlsx` and a `.jsonl` (see [Data format](../building/analysis-exports.md#data-format)), plus `error.log`.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Chatbot name. |
| `from_date` | string | no | Start of the date range (ISO 8601). |
| `to_date` | string | no | End of the date range (ISO 8601). |

Background recipients: the chatbot's owner and administrators.

```bash
curl -o convos.zip "https://<your-backend-host>/export-convo-history?course_name=your-chatbot-name&from_date=2026-01-01&to_date=2026-06-30"
```

## `GET /export-convo-history-csv`

Same parameters and recipients as `/export-convo-history`. Despite the name, the zip contains one `.jsonl` file (one conversation per line), nothing else.

## `GET /export-convo-history-user`

One user's conversations in one chatbot, as markdown plus media files.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `user_email` | string | yes | The user's email address. |
| `project_name` | string | yes | Chatbot name (note the parameter name). |

Background recipient: `user_email`.

## `GET /export-conversations-custom`

Same export as `/export-convo-history-csv`, with your own recipient list.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Chatbot name. |
| `from_date` | string | no | Start of the date range (ISO 8601). |
| `to_date` | string | no | End of the date range (ISO 8601). |
| `destination_emails_list` | string, repeatable | no | Recipients of the background email, e.g. `&destination_emails_list=a@example.edu&destination_emails_list=b@example.edu`. |

Background recipients: the addresses in `destination_emails_list`. The email is sent only on the background path (more than 500 conversations).

## `GET /exportDocuments`

The post-processed text and embeddings of every document, as one `.jsonl` in a zip.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `course_name` | string | yes | Chatbot name. |
| `from_date` | string | no | Start of the date range (ISO 8601). |
| `to_date` | string | no | End of the date range (ISO 8601). |

Background recipients: the chatbot's owner and administrators.

```bash
curl -o documents.zip "https://<your-backend-host>/exportDocuments?course_name=your-chatbot-name"
```

!!! note "Original files"
    Original files (PDFs, etc.) are downloaded per document from the Dashboard's Project Files table, not through this endpoint.
