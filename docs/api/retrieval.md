# Retrieval API

Fetch the most relevant document contexts for a query without generating an answer. These endpoints are served by the Flask backend, which has no authentication of its own — see the note on the [API Reference](index.md) page.

!!! info "Retrieval via the Chat API"
    The [Chat API](chat.md) also supports a `retrieval_only` mode, authenticated with your API key, if you're already integrating against it.

## `POST /getTopContexts`

Fast, single-query vector retrieval.

### Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `search_query` | string | yes | The query to match against the chatbot's documents. |
| `course_name` | string | yes | Chatbot name. |
| `doc_groups` | array | no | Restrict retrieval to specific [document groups](../building/dashboard/document-groups.md). Default: all documents. |
| `top_n` | integer | no | Maximum number of contexts to return. Default `100`. |
| `conversation_id` | string | no | Conversation UUID, recorded with the retrieval. |

### Example

```bash
curl -X POST https://<your-backend-host>/getTopContexts \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "What is a finite state machine?",
    "course_name": "ece-385",
    "doc_groups": ["lectures", "readings"],
    "top_n": 5
  }'
```

### Response

```json
[
  {
    "text": "In FSM, we do this...",
    "readable_filename": "Lumetta_notes.pdf",
    "course_name ": "ece-385",
    "s3_path": "courses/ece-385/Lumetta_notes.pdf",
    "pagenumber": "19",
    "url": null,
    "base_url": null,
    "doc_groups": ["lectures"]
  }
]
```

!!! warning "`course_name ` has a trailing space"
    The chatbot-name key in each context is literally `"course_name "` (with a trailing space). Read it with that exact key; this is a known product bug.

## `GET /getTopContextsWithMQR`

!!! failure "Not available"
    Multi-query retrieval is not implemented in the current backend: the route exists but raises an error for every request. Use `/getTopContexts`. Multi-query retrieval is described under research ideas on the [Retrieval](../how-it-works/retrieval.md) page.
