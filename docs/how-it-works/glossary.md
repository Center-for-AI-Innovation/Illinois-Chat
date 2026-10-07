# Glossary

One line per term; follow the link for the page that owns it.

- **Chatbot** — an assistant with its own documents, settings and access controls; the app and API call it a *project* (`course_name`), older material a *course*. → [Building a Chatbot](../building/index.md)
- **Owner, administrator, member** — the three roles on a chatbot. → [Roles](../building/index.md#roles)
- **Dashboard** — the builder screen for uploads, imports, Project Files, sharing, branding and tags. → [Building a Chatbot](../building/index.md)
- **Document group** — a named subset of a chatbot's documents that users can switch on or off; **All Documents** is the built-in group containing everything. → [Document groups & deleting](../building/dashboard/document-groups.md)
- **Ingest** — the pipeline that turns an uploaded, crawled or imported document into searchable chunks. → [Documents & ingest](documents-ingest.md)
- **Embedding** — the vector a chunk or question is converted into so they can be compared. → [Retrieval](retrieval.md)
- **Tool** — a deployed Sim AI **workflow** that the chatbot can call during a conversation. → [Tools](../building/tools/index.md)
- **Router** — the model that decides whether a tool applies; **Custom**, **Default** or **Offline** on the Tools page. → [Tool routing](tool-routing.md)
- **Agent Mode** — a multi-step loop that can search and call tools repeatedly before answering. → [Prompting](../building/prompting.md)
- **Guided Learning** — the behaviour switch that makes the chatbot hint rather than answer. → [Prompting](../building/prompting.md)
- **External connection** — a chatbot's own vector or SQL database outside the shared stack. → [External connections](../building/external-connections.md)
- **Frozen** — a chatbot locked by the operators; the Chat API returns 403 for it. → [API authentication](../api/authentication.md)
- **API key** — a per-user `uc_…` token valid on every chatbot that user can edit. → [API authentication](../api/authentication.md)
