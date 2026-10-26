# Using a Chatbot

Someone shared a chatbot with you, or you found one in the [hub](finding-chatbots.md). This page covers the chat screen itself; building your own starts at [Building a Chatbot](../building/index.md).

## Asking questions

Type in the chat bar and press Enter. Answers are grounded in the documents the chatbot's builder added, and they cite their sources. Depending on the model, you can also attach images to a message.

## Choosing a model

The **model picker** next to the chat bar lists the models the builder enabled on the chatbot's [LLMs](../building/llms.md) page. The builder's default model is pre-selected; you can switch per conversation.

## Settings

The **Settings** panel on the chat page has three tabs:

- **Model** — the model and its **temperature** (`0` precise to `1` creative; the default is `0.1`).
- **Document Groups** — switch groups of documents on or off to narrow what the chatbot searches. See [Document groups](../building/dashboard/document-groups.md).
- **Tools** — switch the chatbot's tools on or off for this conversation. See [Tools](../building/tools/index.md).

When the builder has enabled Agent Mode, an **Agent Mode** pill appears next to the model picker; see [Prompting](../building/prompting.md) for what it changes.

## Sources and citations

Answers contain numbered citations. Click the **Sources** button under an answer to open the sources sidebar: each entry shows the passage, its filename or URL, the page number where available, and a link to the original document.

## Your conversation history

Previous conversations are listed in the left sidebar; click one to continue it. At the bottom of the sidebar:

- **Export history** downloads a zip of your conversations as Markdown files, including any media.
- **Clear conversations** deletes all of your conversations with this chatbot.
