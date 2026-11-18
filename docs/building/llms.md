# LLMs

Illinois Chat is model-agnostic: each chatbot chooses which large language models power it, and users can switch models per conversation. Everything on this page is set on the chatbot's **LLMs** screen ("Configure LLM Providers for your Chatbot").

## Supported providers

The page groups providers in two sets:

| Group | Providers |
| --- | --- |
| **Closed models (bring your own key)** | Anthropic, OpenAI, OpenAI Compatible (any endpoint that speaks the OpenAI API, such as vLLM — base URL including `/v1`), Azure OpenAI, Amazon Bedrock, Google Gemini, SambaNova |
| **Open models (no key needed)** | NCSA Hosted LLMs, NCSA Hosted VLMs, Ollama, WebLLM (runs entirely in the user's browser) |

Free NCSA-hosted models are a zero-cost starting point; commercial providers generally give better instruction-following and citation quality, and you pay the provider directly for usage.

## Bring your own key

For commercial providers you paste your own API key on the LLMs page. Keys are stored encrypted per chatbot and used to serve the chatbot's requests from both the chat interface and the [Chat API](../api/chat.md). Your data is never used to train models — provider interactions are contractually protected.

## Lumen

To use [Lumen](https://lumen.ncsa.illinois.edu/help/connect), enable **OpenAI Compatible** on the LLMs page, set **Base URL** to `https://lumen.ncsa.illinois.edu/v1`, and enter your Lumen API key. Enable the models you want to offer and select a default.

Illinois Chat shows supported chat models returned by Lumen for your key, including the `deepseek`, `deepseek-v4.1`, and `glm` aliases. Models requiring acknowledgment must first be acknowledged in Lumen before they appear. Audio-only transcription models are excluded from the chat model list.

## Enabling models

- Each provider card has a switch; inside it, each model has its own switch. Users and the API can only use models that are enabled.
- **Default Model** picks the model new conversations start with. Users can choose a different enabled model from the model picker in chat; API callers pass `model`.
- Models hosted in countries of concern show a warning before you enable them or set them as default (**Enable anyway** / **Set as default anyway**).

**Temperature** is not set on this page: users choose it per conversation in the chat **Settings › Model** tab, and it defaults to `0.1`.

## Vision and tools

- **Image input** is supported on vision-capable models (for example GPT-4o or Claude).
- **Tool selection** does not use the chat model you pick here; see [Tool routing](../how-it-works/tool-routing.md).

The embedding model used for retrieval is set by the operator, not per chatbot — see the [Configuration reference](../self-hosting/configuration.md).
