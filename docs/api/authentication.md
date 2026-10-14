# Authentication

Chat API requests are authenticated with one key, `api_key`, passed in the **JSON request body** (not a header).

## API key (`api_key`)

Identifies you; the request is then authorized against the chatbot named in `course_name`.

- **Per user, not per chatbot:** the key belongs to your account and works on every chatbot you can edit (owner or administrator). A request against a chatbot you cannot edit is rejected.
- **Format:** `uc_` followed by 32 hex characters.
- **Where to get it:** open `https://chat.illinois.edu/<chatbot-name>/api` (the **API** entry in the chatbot sidebar) and click **Generate API Key**. The page shows pre-filled `curl` and language-specific snippets with your key inserted.
- **One key at a time:** your account has at most one active key. **Rotate API Key** replaces it and invalidates the previous key immediately; **Delete API Key** revokes it.

!!! danger "Treat API keys as secrets"
    Anyone with your key can chat against every chatbot you can edit, using the provider keys configured on those chatbots. Store keys in environment variables or a secrets manager, never in client-side code or version control.

## LLM provider keys

Provider keys are not part of the request. They are configured once on the chatbot's [LLMs page](../building/llms.md), stored encrypted, and used for both the web app and the API. The `model` you request must be enabled on that page.

## Errors

Authentication and authorization failures return `403` with a JSON `error` field (invalid key, no edit rights on the chatbot, or a frozen chatbot). The full status table is on the [Chat](chat.md) page.

## Example

```python
import os
import requests

response = requests.post(
    "https://chat.illinois.edu/api/chat-api/chat",
    json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Hello!"}],
        "course_name": "your-chatbot-name",
        "api_key": os.environ["ILLINOIS_CHAT_API_KEY"],
    },
)
```
