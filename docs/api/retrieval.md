# Retrieval API

Fetch the most relevant document contexts for a query without generating an answer.

Retrieval runs inside the web app: by default it searches **pgvector** in the chatbot's Postgres database. How ranking works is described on the [Retrieval](../how-it-works/retrieval.md) page.

## `retrieval_only` on the Chat API

Send a normal [Chat request](chat.md) with `"retrieval_only": true`. The app embeds the last user message, searches the chatbot's documents and returns the contexts instead of an answer. `model` is still required and must be enabled on the chatbot; if nothing matches, the request falls through to the LLM and returns a normal `{"message": ..., "contexts": []}` answer.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | string | yes | A model enabled on the chatbot's [LLMs page](../building/llms.md). |
| `messages` | array | yes | OpenAI-style messages; the last `user` message is the search query. |
| `course_name` | string | yes | Chatbot name. |
| `api_key` | string | yes | Your API key. |
| `retrieval_only` | boolean | yes | `true`. |
| `doc_groups` | array | no | Restrict retrieval to specific [document groups](../building/dashboard/document-groups.md). Default `["All Documents"]`. |
| `top_n` | integer | no | Maximum number of contexts to return. Default `100`. |
| `conversation_id` | string | no | Conversation UUID, recorded with the retrieval. |

```bash
curl -X POST https://chat.illinois.edu/api/chat-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "What is a finite state machine?"}],
    "course_name": "ece-385",
    "api_key": "uc_YOUR_API_KEY",
    "retrieval_only": true,
    "doc_groups": ["lectures", "readings"],
    "top_n": 5
  }'
```

```json
{
  "contexts": [
    {
      "id": 48213,
      "text": "In FSM, we do this...",
      "readable_filename": "Lumetta_notes.pdf",
      "course_name": "ece-385",
      "course_name ": "ece-385",
      "s3_path": "courses/ece-385/Lumetta_notes.pdf",
      "pagenumber": "19",
      "url": "",
      "base_url": "",
      "doc_groups": ["lectures"]
    }
  ]
}
```

Status codes are the Chat API's; see its [status table](chat.md#status-codes).

## The context object

| Key | Meaning |
| --- | --- |
| `id` | Chunk ID in the vector store. |
| `text` | The chunk text. |
| `readable_filename` | Display name of the source document. |
| `course_name` | Chatbot name. The same value is repeated under the key `"course_name "` (with a trailing space); Qdrant-backed chatbots return only the trailing-space form, so read that key when you need to support both. |
| `s3_path` | Object-storage path of the uploaded file, empty for crawled pages. |
| `pagenumber` | Page (or timestamp) the chunk came from, as a string. |
| `url`, `base_url` | Source URL of a crawled page and the crawl's starting URL; empty for uploads. |
| `doc_groups` | Groups the chunk's document belongs to. |

## Chatbots with an external Qdrant connection

A chatbot that has an [external Qdrant connection](../building/external-connections.md) is searched by the Flask backend, and the app forwards retrieval to it, so nothing changes for callers. If you run the stack yourself and have exposed the backend, you can also call it directly. The body takes `search_query`, `course_name`, and optionally `doc_groups`, `top_n` (default `100`) and `conversation_id`:

```bash
curl -X POST https://<your-backend-host>/getTopContexts \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "What is a finite state machine?",
    "course_name": "ece-385",
    "doc_groups": ["lectures"],
    "top_n": 5
  }'
```

The response is the bare array of context objects, with the chatbot name under the `"course_name "` key only.
