# Sim AI user guide

Illinois Chat uses [Sim AI](https://sim.ai) as its tool platform: workflows built and
deployed in a Sim workspace become tools that chatbots can call during a conversation.
This guide covers how to get access to Sim, how admin approval works, how to wire a Sim
workspace into an Illinois Chat project, and which blocks you can use.

If you maintain the deployment rather than build tools with it, read the
[Sim developer guide](sim-developer-guide.md) instead.

## 1. Signing in to Sim with your Illinois identity (Keycloak SSO)

Sim shares the same Keycloak realm as Illinois Chat, so you sign in to Sim with the same
account you use for the chat app — there is no separate Sim password.

1. Open the Sim app (`http://localhost:3010` on the local stack, or your deployment's
   Sim URL).
2. On the login page, enter your email address and choose the single sign-on option.
   The single email domain in `SIM_SSO_DOMAIN` (default: `illinois.edu`) is routed
   to the Keycloak provider; addresses in any other domain are refused.
3. You are redirected to Keycloak. Log in with your Illinois Chat credentials.
4. Keycloak sends you back to Sim, which creates your Sim identity automatically on the
   first sign-in.

### Waiting for approval

New Sim accounts do **not** get access immediately. Every first sign-in lands in a
`pending` state ("Pending admin approval") and the account is held until a Sim platform
admin approves it. If you see a message that your account is banned or pending, nothing
is wrong — an admin simply has not approved you yet. Contact your deployment's Sim
admin, then sign in again once you have been approved; there is no need to re-register.

## 2. How admin approval works

The approval gate lives in Sim's own database (`infra/docker/sim/approval-setup.sql`): a
`sim_user_approval` table stores one decision per email (`pending`, `approved`, or
`blocked`), and database triggers enforce it on Sim's user and session tables. The
bootstrap platform admin is the address in `SIM_APPROVAL_ADMIN_EMAIL` (required in
`.env`; the Sim stack refuses to start without it).

Admins have two equivalent ways to act on a request:

- **In Sim's UI**: sign in as a platform admin and open **Settings → Admin**. Pending
  users appear as banned; use **Unban** to approve them. Banning a user blocks them
  again. Actions taken here are mirrored into the approval table automatically.
- **In the database**: update the row directly, e.g.
  `UPDATE sim_user_approval SET status = 'approved' WHERE email = 'someone@illinois.edu';`
  Valid statuses are `approved`, `pending`, and `blocked`.

Decisions take effect immediately: approving unlocks the account on the next sign-in,
and blocking revokes the user's live Sim sessions on the spot. Setting `is_admin = true`
on a row promotes that user to Sim platform admin.

## 3. Connecting a Sim workspace to an Illinois Chat project

Tools are configured per project by a project owner or admin on the project's **Tools**
page (`/<project-name>/tools`, "Tools" in the sidebar). You need two values from Sim:

1. **API key** — in Sim, open **Settings → Sim Keys** and create an API key
   (`sk-sim-...`). The key is stored encrypted server-side and only a masked version is
   ever shown again. If the Tools page reports that the stored key "could not be read",
   the deployment's `ENCRYPTION_MASTER_KEY` changed since the key was saved (or a database
   migration is missing); paste the key again to restore tools.
2. **Workspace ID** — in Sim, open the workspace you want to connect; the workspace ID
   is the identifier in the browser URL (`.../workspace/<workspace-id>/...`) and in the
   workspace settings.

On the Tools page:

1. Paste the **API Key** and **Workspace ID**.
2. **Base URL** is optional: leave it blank to use the deployment default. Set it only
   when pointing the project at a different Sim instance — the URL must be sim.ai or an
   origin the operator has allowlisted (`SIM_API_BASE_URL` / `SIM_ALLOWED_SIM_ORIGINS`),
   otherwise saving is rejected.
3. Save. The page lists every **deployed** workflow discovered in the workspace, along
   with the input fields each workflow expects.

Only deployed workflows are discovered — drafts do not appear until you deploy them in
Sim. Give each workflow a clear description in Sim: the description is what the model
reads when deciding whether to call your tool, and undescribed workflows are flagged on
the Tools page with a placeholder description.

The Tools page also shows the project's tool-routing status: **Custom router** (tool
calls are routed through the project's own OpenAI or OpenAI-compatible provider),
**Default router** (the Illinois-hosted model does the routing), or **Offline** (no
router is configured — add an LLM key or ask the operator to configure the hosted
default).

## 4. Letting others build tools in your workspace

Tool building happens in Sim, so collaboration is managed with Sim's own workspace
membership:

1. Each collaborator first needs Sim access: they sign in via SSO once (section 1) and a
   platform admin approves them (section 2).
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

## 5. Which Sim blocks you can use

Not every block Sim ships is available on this deployment. When you open the block
picker you will see the core workflow blocks plus a selected set of tools you can
authenticate yourself. Everything else is hidden on purpose.

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

**Vendors that sign you in with a Connect button are switched off for this release.**
That covers Google Drive, Docs, Sheets, Calendar and Gmail, along with Notion, Jira,
Confluence, Box, Dropbox, Zoom, Slack, Asana, ClickUp, Monday, HubSpot, Salesforce,
Linear, Airtable, Microsoft 365 and the rest.

This is a deliberate decision, not a bug, and it is not something you can work around by
supplying your own credentials. Connecting any of these requires us to register an
application with that vendor first, under an account the team still has to agree on. Until
that happens the connection cannot be completed by anyone. We plan to enable a first group
of these, and the list will grow from there.

**A number of other tools are switched off for now** simply because we started small.
That includes the cloud infrastructure and security tools such as AWS, SSH, SFTP, Okta and
1Password. If you need one, ask — expanding the list is a configuration change, not
development work.

**Some blocks you may have seen before are gone**, because they do not work on this
deployment or would send data to a service we do not control: Search, Sim Chat, Data
Enrichment, Connected Accounts, Credential, Pi, A2A, Circleback and Video Generator.

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

Open an issue on the Illinois Chat repository describing the block you need and what you
are building with it. Adding a tool you authenticate yourself is a small configuration
change. Adding a Connect-button vendor depends on registering an application with that
vendor first, so it takes longer.

## 6. Learning more about Sim itself

Everything above is specific to our deployment. For how Sim works in general — writing
prompts, wiring blocks together, testing a workflow — use Sim's own documentation:

- [Build your first workflow](https://docs.sim.ai/introduction) — the starting point.
- [Blocks reference](https://docs.sim.ai/workflows/blocks/agent) — what each core block
  does. Agent, API, Condition, Function, Router and Response are the ones you will use
  most, and all are available here.
- [Connecting blocks](https://docs.sim.ai/workflows/connections) — how data flows from one
  block into the next.
- [Variables and secrets](https://docs.sim.ai/platform/credentials) — storing an API key
  once and referencing it as `{{KEY}}` instead of pasting it into every block.
- [Triggers](https://docs.sim.ai/workflows/triggers/start) — how a workflow starts. For
  Illinois Chat tools the start trigger matters most: the inputs you declare on it become
  the tool's parameters, and a workflow whose inputs have no descriptions is skipped by
  discovery rather than published with a guessed signature.
- [Integrations](https://docs.sim.ai/integrations/firecrawl) — one page per tool block,
  listing its operations and the inputs each needs.

**One caveat when reading those pages.** Sim's documentation tracks their latest release,
while this deployment runs a pinned, slightly older version. Most of it applies unchanged,
but two things differ often enough to watch for:

- **A block or feature described there may not exist here yet.** If the block picker does
  not show something the docs mention, it is either newer than our version or not on the
  allowed list in section 5.
- **Anything about billing, hosted keys or "Sim Cloud" does not apply.** This is a
  self-hosted instance. Where the docs say Sim supplies a key for you, you supply your own.

If a page describes something you need and it is not available here, open an issue on the
Illinois Chat repository rather than working around it.
