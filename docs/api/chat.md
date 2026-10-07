# Chat API

The primary endpoint for developers: RAG-grounded chat over your chatbot's documents, with streaming, multi-turn conversations, image input, and automatic tool use.

```
POST https://chat.illinois.edu/api/chat-api/chat
```

## Request body

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | string | yes | Model ID, e.g. `gpt-4o-mini`. The model must be enabled on the chatbot's [LLMs page](../building/llms.md), which also shows the IDs of the models available there. Required even with `retrieval_only`. |
| `messages` | array | yes | OpenAI-style message list (`role`: `system` \| `user` \| `assistant`; `content`: string or content-part array for images). Must contain at least one `user` message. |
| `course_name` | string | yes | Your chatbot name (the slug in its URL). |
| `api_key` | string | yes | Your API key. See [Authentication](authentication.md). |
| `temperature` | number | no | `0.0`–`1.0`. Default: the chatbot's default model's temperature setting, else `0.1`. |
| `stream` | boolean | no | Stream the response. Default `false`. |
| `retrieval_only` | boolean | no | Return only the retrieved contexts without calling the LLM. Default `false`. If no contexts are found, the request falls through to the LLM anyway. |
| `conversation_id` | string | no | UUID of an existing conversation to continue; a new one is created when omitted. |
| `doc_groups` | array | no | [Document groups](../building/dashboard/document-groups.md) to search. Default `["All Documents"]`. |
| `top_n` | integer | no | Maximum number of contexts to retrieve. Positive integer, default `100`. |

## Response

Non-streaming responses include **both** the LLM answer and the retrieved contexts:

```json
{
  "message": "The documents cover ...",
  "contexts": [
    {
      "text": "…passage text…",
      "readable_filename": "Lecture 3 – State Machines.pdf",
      "course_name": "ece-385",
      "url": "",
      "pagenumber": "12"
    }
  ]
}
```

With `"retrieval_only": true` and at least one context found, the response is `{"contexts": [...]}`.

Streaming responses (`"stream": true`) are raw text chunks over `text/event-stream`, written as the model generates them; citation markers are rewritten into links as they stream.

### Status codes

| Status | When |
| --- | --- |
| `405` | Method other than `POST`. |
| `400` | Invalid body: a required field is missing, the model is not a supported model ID, `messages` is empty or has no `user` message, `temperature` is outside `0`–`1`, `top_n` is not a positive integer, or an image was sent to a model without vision support. The `error` field says which. |
| `403` | Invalid API key. |
| `404` | Unknown chatbot (`course_name`). |
| `403` | The chatbot is frozen by an administrator. |
| `400` | The model is not enabled on this chatbot; the message lists the enabled models. |
| `403` | Your key is valid but you cannot edit this chatbot. |
| `400` | No messages in the conversation. |
| `200` | `{"contexts": [...]}` (retrieval only) or `{"message": "...", "contexts": [...]}`; streaming responses send text chunks. |
| *upstream* | Errors from the model provider are passed through with the provider's status code and `{"error": "API error: ..."}`. |
| `500` | The response could not be processed. |

## Examples

=== "curl"

    ```bash
    curl -X POST https://chat.illinois.edu/api/chat-api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gpt-4o-mini",
        "messages": [
          {"role": "system", "content": "Your system prompt here"},
          {"role": "user", "content": "What is in these documents?"}
        ],
        "temperature": 0.1,
        "course_name": "your-chatbot-name",
        "stream": true,
        "api_key": "uc_YOUR_API_KEY"
      }'
    ```

=== "Python (streaming)"

    ```python
    import requests

    url = "https://chat.illinois.edu/api/chat-api/chat"
    data = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Your system prompt here"},
            {"role": "user", "content": "What is in these documents?"},
        ],
        "temperature": 0.1,
        "course_name": "your-chatbot-name",
        "stream": True,
        "api_key": "uc_YOUR_API_KEY",
    }

    with requests.post(url, json=data, stream=True) as response:
        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            print(chunk, end="", flush=True)
    ```

=== "Python (non-streaming)"

    ```python
    import requests

    url = "https://chat.illinois.edu/api/chat-api/chat"
    data = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "Your system prompt here"},
            {"role": "user", "content": "What is in these documents?"},
        ],
        "temperature": 0.1,
        "course_name": "your-chatbot-name",
        "stream": False,
        "api_key": "uc_YOUR_API_KEY",
    }

    result = requests.post(url, json=data).json()
    print(result["message"])
    print(result["contexts"])
    ```

### Retrieval only

Return relevant contexts without invoking an LLM. `model` is still required and must be enabled on the chatbot; if nothing matches, the request falls through to the LLM and returns a normal answer.

```python
import requests

data = {
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "What is in these documents?"}],
    "course_name": "your-chatbot-name",
    "api_key": "uc_YOUR_API_KEY",
    "retrieval_only": True,
    "doc_groups": ["Lectures"],
    "top_n": 20,
}
result = requests.post("https://chat.illinois.edu/api/chat-api/chat", json=data).json()
print(result["contexts"])
```

### Image input

Send images as part of a message using a vision-capable model; other models return `400`:

```python
data = {
    "model": "gpt-4o",
    "messages": [
        {"role": "system", "content": "Your system prompt here"},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},
                {"type": "text", "text": "Give me more information on the action depicted in this image."},
            ],
        },
    ],
    "course_name": "your-chatbot-name",
    "api_key": "uc_YOUR_API_KEY",
}
```

### Multi-turn conversations

Pass the full conversation history in `messages`, alternating `user` and `assistant` roles — exactly like the OpenAI chat format. Text and image parts can be mixed in the same conversation. Pass the same `conversation_id` to keep the turns in one conversation in the chatbot's history.

### Choosing a model

Any model enabled on the chatbot's [LLMs page](../building/llms.md) can be requested, including the free NCSA-hosted models; the page lists each model's ID. Response quality and citation accuracy vary by model.

### Tool use

Tools connected to your chatbot are invoked automatically based on the LLM's judgment — there is no way to force invocation, but you can encourage it via prompting. Which model decides on tool calls is described in [Tool routing](../how-it-works/tool-routing.md). See [Tools](../building/tools/index.md).
