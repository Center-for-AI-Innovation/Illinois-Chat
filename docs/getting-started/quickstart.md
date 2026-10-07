# Quickstart

Get from zero to a working, document-grounded chatbot in about five minutes.

!!! success "TL;DR"
    Illinois Chat is the easiest way to *train your own LLM* and *share it like a Google Doc*.

## 1. Sign in and create a chatbot

Go to [chat.illinois.edu](https://chat.illinois.edu) and sign in. Create a new **chatbot** — a chatbot is scoped to a topic, course, or team, with its own documents, settings, and access controls. See [Building a Chatbot](../building/index.md).

## 2. Upload documents

Open your chatbot's **Dashboard** and add content:

- **Drag and drop files** onto **Upload materials** — PDF, Word, PowerPoint, Excel, CSV, text, HTML, code files and images.
- **Crawl a website** — enter a starting URL and the built-in crawler ingests linked pages. See [Web crawling](../building/dashboard/web-crawling.md).
- **Import from Canvas** — on the Canvas card choose **Configure import** to bring in course files, pages, and modules. See [Importing](../building/dashboard/importing.md).

Documents are automatically chunked, embedded, and indexed. See [Uploading files](../building/dashboard/uploading-files.md) for supported formats and details.

## 3. Configure an LLM provider

On the **LLMs** page, bring your own API key (OpenAI, Anthropic, Azure OpenAI, and others are supported) and enable the models you want. Free NCSA-hosted open models are also available with no key required. See [LLMs](../building/llms.md).

!!! info "Your keys are yours"
    Provider keys are stored encrypted and used only to serve your chatbot's requests. Your data is never used to train models.

## 4. Chat and review citations

Ask a question in the **Chat** tab. Your query is embedded, matched against your chatbot's documents, and the most relevant passages are streamed to the LLM, which answers with citations. Click the **Sources** button under an answer to see each cited passage with its filename, page number, and a link to the original document.

## 5. Customize the system prompt (optional)

Tailor your chatbot's behavior on the **Prompting** page — for example, enable **Guided Learning** so the chatbot guides students toward answers instead of giving them away. See [Prompting](../building/prompting.md).

## 6. Share it

Every chatbot has a permanent URL you can share. Control who gets access — only invited members, all logged-in users, or anyone with the link. See [Sharing & access](../building/dashboard/sharing-access.md).

## 7. Integrate via API (optional)

Generate an API key on your chatbot's API page and call the chat endpoint from your own applications. The model you name must be enabled on the chatbot's LLMs page; the provider key configured there is used for the request.

```bash
curl -X POST https://chat.illinois.edu/api/chat-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "What is in these documents?"}],
    "course_name": "your-chatbot-name",
    "api_key": "uc_YOUR_API_KEY"
  }'
```

See the [API Reference](../api/index.md) for full details.

## Next steps

- [Using a chatbot](using-a-chatbot.md) — what your users see.
- [FAQs](faqs.md) — common questions about cost, support, and security.
- [Video walkthroughs](video-walkthroughs.md) — short screencasts of common workflows.
- [Self-hosting](../self-hosting/index.md) — run the entire platform on your own infrastructure.
