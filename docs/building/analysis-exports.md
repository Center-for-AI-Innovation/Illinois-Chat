# Analysis & Exports

When you share your chatbot as a learning tool, Illinois Chat shows you how people use it — helping you understand your audience's needs and improve your content. Only the owner and administrators can see the Analysis page and run exports.

## The Analysis page

Open **Analysis** in your chatbot to see statistics and charts:

- **Usage over time** — conversation and message volume, including weekly trends.
- **Model usage** — which LLMs are being used and how often.

Use it to spot gaps: questions that come up repeatedly with weak answers usually mean a document is missing from your knowledge base. To read what users actually asked, export the conversations.

## Export all conversations

On the **Analysis** page, **Download Conversation History** downloads *all* conversations anyone has had with your chatbot as a zip containing:

- `markdown export/` — one readable Markdown file per conversation,
- `media_files/` — images attached to messages,
- an `.xlsx` spreadsheet and a `.jsonl` file of the same conversations,
- `error.log` for anything that could not be exported.

### Data format

The `.jsonl` file is JSON Lines, one conversation per row:

- If a user was authenticated when chatting, their email address is included; otherwise `null`.
- Messages mirror [OpenAI's chat format](https://platform.openai.com/docs/api-reference/chat/create) (`role`/`content` pairs).
- Each `assistant` message additionally includes the `contexts` that were (potentially) used to answer — up to 100 contexts per response, each with `text`, `readable_filename`, `s3_path`, `url`, and `pagenumber` metadata.

### Reading the export

```python
import jsonlines
import pprint

filename = 'myProject-convo_history.jsonl'
with jsonlines.open(filename) as f:
    data = list(f)

print(len(data))
pprint.pprint(data[0])
```

Each row looks like:

```json
{
  "convo_id": "03a9ffb3-5bde-4766-a4eb-66dff42ed8ac",
  "course_name": "my-project",
  "user_email": "user@illinois.edu",
  "created_at": "2025-08-14T16:35:40.508062-07:00",
  "convo": {
    "model": {"id": "gpt-4o", "name": "GPT-4o"},
    "prompt": "Your system prompt...",
    "temperature": 0.4,
    "messages": [
      {"role": "user", "content": "...", "contexts": []},
      {"role": "assistant", "content": "...", "contexts": [{"text": "...", "readable_filename": "...", "url": "...", "pagenumber": ""}]}
    ]
  }
}
```

## Export all documents

**Export** in the **Project Files** table on the Dashboard downloads a zip with one `.jsonl` file of the post-processed text and vector embeddings used by the LLM. To minimize data-transfer costs, exporting *original* files (PDFs, etc.) is only available per-document.

## Large exports

When an export covers more than 500 conversations or documents it runs as a background job. A download link is emailed to the chatbot's owner and administrators when the deployment has the backend's email settings (see the [Configuration reference](../self-hosting/configuration.md)); otherwise the export is written to object storage and nothing is sent.

## A user's own history

Each user can download their own conversations with the chatbot: **Export history** in the chat sidebar produces a zip of Markdown files plus media. See [Using a chatbot](../getting-started/using-a-chatbot.md).

## Privacy notes

- If a user is authenticated when chatting, their email is included in conversation logs; otherwise it is `null`.
- Only the owner and administrators can access conversation history and exports.

## Programmatic export

Exports are also available via the API — see the [Export API](../api/export.md).
