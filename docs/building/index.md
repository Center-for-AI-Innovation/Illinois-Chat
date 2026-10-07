# Building a Chatbot

A **chatbot** is the basic unit of organization in Illinois Chat: an assistant scoped to a topic, course, research group, or team. Documents in one chatbot are completely isolated from every other chatbot; retrieval never crosses chatbot boundaries.

!!! note "Chatbot, project, course"
    The app's routes, settings and API call a chatbot a **project** (`course_name` in API payloads), and older material says **course**. These docs say *chatbot*; technical identifiers stay as they are in the product.

## Chatbot URL

Every chatbot gets a permanent, shareable URL based on its name:

```
https://chat.illinois.edu/<chatbot-name>
```

Names must be unique across the instance and become part of the URL, so pick something short and recognizable (for example `ece-408` or `soil-science-lab`). New chatbots start out private.

## The builder screens

The sidebar of a chatbot you can edit has one entry per screen:

| Screen | What you do there |
| --- | --- |
| **Dashboard** | Upload files, import from Canvas, a website or GitHub, manage Project Files, open **Sharing and Access**, set Branding (greeting, example questions, logo) and Tags. See [Uploading files](dashboard/uploading-files.md), [Web crawling](dashboard/web-crawling.md), [Importing](dashboard/importing.md), [Document groups & deleting](dashboard/document-groups.md), [Sharing & access](dashboard/sharing-access.md). |
| **LLMs** | Add provider keys, enable models, pick the default model. See [LLMs](llms.md). |
| **Analysis** | Usage statistics and conversation exports. See [Analysis & exports](analysis-exports.md). |
| **Prompting** | The system prompt and behaviour switches such as Guided Learning. See [Prompting](prompting.md). |
| **Tools** | Connect a Sim AI workspace so deployed workflows become tools. See [Tools](tools/index.md). |
| **API** | Generate and rotate your API key. See the [API Reference](../api/index.md). |

Users see only the **Chat** screen, described in [Using a chatbot](../getting-started/using-a-chatbot.md).

## Roles

| Role | Stored as | Capabilities |
| --- | --- | --- |
| **Owner** | `course_owner` | The person who created the chatbot. Everything administrators can do. |
| **Administrators** | `course_admins` | Edit every builder screen: documents, LLMs, prompt, tools, sharing, analytics and exports. |
| **Members** | `approved_emails_list` | Chat with the chatbot when it is private. |

Owners and administrators are set in the Sharing and Access dialog; see [Sharing & access](dashboard/sharing-access.md). API keys belong to a **user**, not to a chatbot, and work on every chatbot that user can edit — see [API authentication](../api/authentication.md).

## Next steps

- [Quickstart](../getting-started/quickstart.md) — the whole flow in five minutes.
- [How It Works](../how-it-works/index.md) — what happens to the documents you add and to each question.
