# API Reference

Illinois Chat exposes a REST API so you can integrate your chatbots into your own applications. All requests and responses are JSON over HTTPS.

## Base URL

The **Chat** and **Retrieval** endpoints are served by the Next.js frontend, at the same host as the web app. The examples use the hosted site:

```
https://chat.illinois.edu
```

## Endpoint categories

| Category | What it does | Docs |
| --- | --- | --- |
| **Chat** | RAG-grounded, multi-turn conversations with streaming and image support | [Chat](chat.md) |
| **Retrieval** | Fetch relevant document contexts without an LLM answer | [Retrieval](retrieval.md) |

The Flask backend has further routes (ingest, exports, Nomic maps, statistics, email, graph lookups, `/createProject`, …) that the web app calls internally; they have no authentication of their own, are not documented here and may change without notice. Every other frontend route under `/api/*` (for example the `/api/UIUC-api/*` download, upload, ingest and Sim tool routes, `/api/projectConnections*` and `/api/chat-api/keys/*`) needs a browser session cookie and is not part of the public API; the one session-only route documented here is `/api/getContexts` on the [Retrieval](retrieval.md) page.

## Authentication

Chat requests are authenticated with a per-user **API key** passed in the JSON body (not a header). The LLM provider key is configured on the chatbot's LLMs page, not sent per request. See [Authentication](authentication.md).

## Streaming

The Chat endpoint streams (`"stream": true`) as raw text chunks over a `text/event-stream` response, written as the model generates them.

## Rate limits

No rate limits are currently published for the hosted site. Heavy programmatic workloads are better suited to a [self-hosted deployment](../self-hosting/index.md).

## Quick example

```bash
curl -X POST https://chat.illinois.edu/api/chat-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Summarize the key topics in these documents."}],
    "course_name": "your-chatbot-name",
    "api_key": "uc_YOUR_API_KEY",
    "temperature": 0.1,
    "stream": false
  }'
```
