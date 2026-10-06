# Sim AI user guide

Illinois Chat uses [Sim AI](https://sim.ai) as its tool platform: workflows built and
deployed in a Sim workspace become tools that chatbots can call during a conversation.
This guide covers how to get access to Sim, how to wire a Sim workspace into an Illinois
Chat project, how to let others build tools with you, and which blocks you can use.

If you maintain the deployment rather than build tools with it, read the
[Sim AI operator guide](sim-developer-guide.md) instead. For how tools behave once they are
connected, see [Tools & Workflows](guides/tools-workflows.md); for a complete worked example,
see [Build a Tool in Sim](guides/build-a-sim-tool.md).

## Signing in to Sim with your Illinois identity (Keycloak SSO)

Sim shares the same Keycloak realm as Illinois Chat, so you sign in to Sim with the same
account you use for the chat app — there is no separate Sim password.

1. Open Sim ([sim.chat.illinois.edu](https://sim.chat.illinois.edu/) on the hosted site, or
   your deployment's Sim URL).
2. On the login page, enter your email address and choose the single sign-on option. Only
   addresses in the deployment's SSO domain (`illinois.edu` on the hosted site) are
   accepted; addresses in any other domain are refused.
3. You are redirected to Keycloak. Log in with your Illinois Chat credentials.
4. Keycloak sends you back to Sim, which creates your Sim identity automatically on the
   first sign-in.

### Waiting for approval

New Sim accounts do **not** get access immediately. Every first sign-in lands in a
`pending` state ("Pending admin approval") and the account is held until a Sim platform
admin approves it. If you see a message that your account is banned or pending, nothing
is wrong — an admin simply has not approved you yet. On the hosted site, email
[genaisupport@mx.uillinois.edu](mailto:genaisupport@mx.uillinois.edu) with the address you
signed in with; on a self-hosted deployment, contact whoever runs it (see
[Getting help](#getting-help)). Sign in again once you have been approved; there is no
need to re-register.

## Connecting a Sim workspace to an Illinois Chat project

Tools are configured per project by a project owner or admin on the project's **Tools**
page (`/<project-name>/tools`, "Tools" in the sidebar). You need two values from Sim:

1. **API key** — in Sim, open **Settings → Sim Keys** and create an API key
   (`sk-sim-...`). The key is stored encrypted server-side and only a masked version is
   ever shown again. If the Tools page later reports that the stored key "could not be
   read", paste the key again; if that keeps happening, [contact support](#getting-help).
2. **Workspace ID** — in Sim, open the workspace you want to connect; the workspace ID
   is the identifier in the browser URL (`.../workspace/<workspace-id>/...`) and in the
   workspace settings.

On the Tools page:

1. Paste the **API Key** and **Workspace ID**.
2. **Base URL** is optional: leave it blank to use the deployment default. Only set it if
   your operator has told you to point the project at a different Sim instance; other
   URLs are rejected when you save.
3. Save. The page lists every **deployed** workflow discovered in the workspace, along
   with the input fields each workflow expects.

Only deployed workflows are discovered — drafts do not appear until you deploy them in
Sim. Give each workflow a clear description in Sim: the description is what the model
reads when deciding whether to call your tool, and undescribed workflows are flagged on
the Tools page with a placeholder description.

The Tools page also shows the project's tool-routing status: **Custom router** (tool
calls are routed through the project's own OpenAI or OpenAI-compatible provider),
**Default router** (the Illinois-hosted model does the routing), or **Offline** (no
router is configured — add an LLM key on the project's **LLMs** page, or ask the operator
to configure the hosted default).

## Letting others build tools in your workspace

Tool building happens in Sim, so collaboration is managed with Sim's own workspace
membership:

1. Each collaborator first needs Sim access: they sign in via SSO once and a platform
   admin approves them (see [Signing in](#signing-in-to-sim-with-your-illinois-identity-keycloak-sso)).
2. In Sim, open your workspace and invite them by email from the workspace's member
   management, granting write (edit) permission so they can create and deploy workflows.
3. Anything they deploy in that workspace automatically appears on the Tools page of
   every Illinois Chat project connected to that workspace ID — no extra configuration
   in Illinois Chat is needed.

Keep in mind that the project's Sim API key is what executes the tools, and workspace
membership is what controls who can add or change them. Removing someone from the
workspace (or blocking their Sim account) immediately stops them from editing tools;
undeploying a workflow in Sim removes it from every connected project's tool list.

In chat, users can toggle individual tools on or off per conversation from the settings
panel's Tools tab; enabled tools are offered to the model automatically when a message
looks like it needs one.

## Which Sim blocks you can use

Not every block Sim ships is available on this deployment. When you open the block
picker you will see the core workflow blocks plus a selected set of tools you can
authenticate yourself. Everything else is hidden on purpose.

!!! note "This list describes the hosted site"
    The lists below are the configuration of the hosted Illinois Chat deployment. A
    self-hosted deployment chooses its own list; if you run one, see the
    [operator guide](sim-developer-guide.md#5-the-block-whitelist).

### What you can use

**Core workflow blocks** — Agent, API, Condition, Function, Router, Response, Evaluator,
Guardrails, Human in the Loop, Variables, Wait, Note, Translate, Memory, Knowledge, MCP,
nested Workflow, Table, Logs, File and Webhook, plus the Schedule, Webhook, RSS, IMAP and
workspace-event triggers. These need no credentials from anyone. The blocks that call a
language model — Agent, Router, Evaluator, Translate and Guardrails — take a model
provider API key that you supply in the block itself.

**Tools you authenticate yourself.** Each takes a key, token or connection string that
you obtain and paste into the block. Nothing is stored or shared by us.

| Group | Available |
|---|---|
| Search and web | Exa, Tavily, Perplexity, Linkup, Serper, Google Search, DuckDuckGo, Wikipedia, ArXiv, Firecrawl |
| Documents and parsing | Jina, Mistral Parser, Reducto, AWS Textract, LaTeX, Google Books |
| Vectors and memory | Pinecone, Qdrant, Mem0, Zep, Embeddings |
| Databases | PostgreSQL, MySQL, SQL Server, MongoDB, Neo4j, ClickHouse, Redis |
| Messaging and email | SMTP, SendGrid, Resend, Discord, Telegram |
| Code and repositories | GitHub, GitLab |
| Media and language | Text to Speech, Speech to Text, Image Generator, ElevenLabs, Google Translate |

Wikipedia, ArXiv, DuckDuckGo and LaTeX need no credential at all. The database blocks
take your own connection string.

### What is not available, and why

**Vendors that sign you in with a Connect button are not available in this release.**
That covers Google Drive, Docs, Sheets, Calendar and Gmail, along with Notion, Jira,
Confluence, Box, Dropbox, Zoom, Slack, Asana, ClickUp, Monday, HubSpot, Salesforce,
Linear, Airtable, Microsoft 365 and the rest. Entering your own credentials in one of these
blocks does not change that; they stay unavailable until support for them is added.

**Some other tools are not enabled yet**, including the cloud infrastructure and security
tools such as AWS, SSH, SFTP, Okta and 1Password.

**Some blocks you may have seen in Sim's own documentation are not offered here**: Search,
Sim Chat, Data Enrichment, Connected Accounts, Credential, Pi, A2A, Circleback and Video
Generator.

### If something you built stops working

Two things can happen to an existing workflow.

**A workflow that uses a switched-off block fails when it runs.** The error names the
block and says it is blocked by the server policy. The workflow itself is not modified,
and it will keep appearing as deployed, so the failure only shows up on execution.

**An agent that had a switched-off vendor attached as a tool keeps running, but quietly
stops using that tool.** There is no error in this case. If an agent used to read from
Notion and simply no longer does, this is the most likely reason. Check the agent's
attached tools.

In Illinois Chat, either case surfaces mid-conversation rather than as a missing tool,
because the tool list is built from what is deployed in Sim.

### Asking for a block to be added

[Contact support](#getting-help) with the block you need and what you are building with
it. Requests like these help decide which blocks are added next.

## Learning more about Sim itself

Everything above is specific to this deployment. For how Sim works in general — writing
prompts, wiring blocks together, testing a workflow — use Sim's own documentation.

Sim's published docs at [docs.sim.ai](https://docs.sim.ai) always describe their **latest**
release, while this deployment runs a pinned, slightly older one (**Sim v0.8.4**). The
table gives both: the page as it was for our version (the documentation source at that
release, viewed on GitHub) and the current page.

| Topic | Why it matters here | Our version (v0.8.4) | Current docs |
|---|---|---|---|
| Build your first workflow | The starting point. | [v0.8.4](https://github.com/simstudioai/sim/blob/e741923f/apps/docs/content/docs/en/introduction/index.mdx) | [current](https://docs.sim.ai/introduction) |
| Blocks reference | What each core block does. Agent, API, Condition, Function, Router and Response are the ones you will use most, and all are available here. | [v0.8.4](https://github.com/simstudioai/sim/tree/e741923f/apps/docs/content/docs/en/workflows/blocks) | [current](https://docs.sim.ai/workflows/blocks/agent) |
| Connecting blocks | How data flows from one block into the next. | [v0.8.4](https://github.com/simstudioai/sim/blob/e741923f/apps/docs/content/docs/en/workflows/connections.mdx) | [current](https://docs.sim.ai/workflows/connections) |
| Variables and secrets | Storing an API key once and referencing it as `{{KEY}}` instead of pasting it into every block. | [v0.8.4](https://github.com/simstudioai/sim/blob/e741923f/apps/docs/content/docs/en/platform/credentials.mdx) | [current](https://docs.sim.ai/platform/credentials) |
| Triggers | How a workflow starts. For Illinois Chat tools the Start trigger matters most: the inputs you declare on it become the tool's parameters, and a workflow whose inputs have no descriptions is skipped by discovery rather than published with a guessed signature. | [v0.8.4](https://github.com/simstudioai/sim/blob/e741923f/apps/docs/content/docs/en/workflows/triggers/start.mdx) | [current](https://docs.sim.ai/workflows/triggers/start) |
| Integrations | One page per tool block, listing its operations and the inputs each needs. | [v0.8.4](https://github.com/simstudioai/sim/tree/e741923f/apps/docs/content/docs/en/integrations) | [current](https://docs.sim.ai/integrations/firecrawl) |

The whole documentation set for our version is browsable at
[`apps/docs/content/docs/en` at `e741923f`](https://github.com/simstudioai/sim/tree/e741923f/apps/docs/content/docs/en).

**Two caveats when reading the current docs.** Most of them apply unchanged, but:

- **A block or feature described there may not exist here yet.** If the block picker does
  not show something the docs mention, it is either newer than our version or not on the
  allowed list above.
- **Anything about billing, hosted keys or "Sim Cloud" does not apply.** This is a
  self-hosted instance. Where the docs say Sim supplies a key for you, you supply your own.

If a page describes something you need and it is not available here,
[contact support](#getting-help) rather than working around it.

## Getting help

For anything about Sim on the hosted Illinois Chat site — account approval, a block you
need, a tool that stopped working — email
[genaisupport@mx.uillinois.edu](mailto:genaisupport@mx.uillinois.edu). This is the same
support contact shown in the Illinois Chat app. Include your sign-in address and, for a
workflow problem, the workflow name and the project it is connected to.

If you use a self-hosted deployment, contact the people who run it; they have the
[operator guide](sim-developer-guide.md).
