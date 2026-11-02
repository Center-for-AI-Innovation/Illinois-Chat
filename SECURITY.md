# Security Policy

Illinois Chat is a self-hostable AI chat platform. The campus-supported instance runs at [chat.illinois.edu](https://chat.illinois.edu); this repository contains the code behind it. We take security reports seriously and appreciate responsible disclosure.

## Supported versions

Security fixes are applied to the `main` branch and to the latest published release. Older releases do not receive backported fixes; self-hosters should upgrade to the latest release.

| Version | Supported |
| --- | --- |
| `main` and the latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report vulnerabilities privately through GitHub's private vulnerability reporting:

1. Go to the repository's [Security tab](https://github.com/Center-for-AI-Innovation/Illinois-Chat/security).
2. Click **Report a vulnerability** and fill in the advisory form.

If you cannot use GitHub, contact the Center for AI Innovation at the University of Illinois through the channels listed at [docs.chat.illinois.edu](https://docs.chat.illinois.edu/) and ask for a private channel to share details.

Please include as much of the following as you can:

- A description of the issue and its potential impact.
- The affected component (frontend, backend, ingest worker, Crawlee crawler, infrastructure, or documentation) and version or commit.
- Steps to reproduce, a proof of concept, or sample requests.
- Any suggested mitigation.

## What to expect

- We will acknowledge your report within 5 business days.
- We will investigate, keep you informed of progress, and work with you to understand the scope.
- Once a fix is ready, we will publish a GitHub Security Advisory and a release. We will credit you in the advisory unless you prefer to remain anonymous.
- We ask that you give us a reasonable amount of time to address the issue before any public disclosure, and that you avoid accessing, modifying, or exfiltrating data that is not your own while testing.

## Scope

In scope:

- Code in this repository: `apps/frontend`, `apps/backend`, `apps/crawlee`, and the `infra/` deployment configuration.
- The campus instance at chat.illinois.edu, within the limits above.

Out of scope:

- Vulnerabilities in third-party dependencies that have no demonstrated impact on Illinois Chat. Please report those upstream; we track dependency updates with Dependabot.
- Issues that require a compromised administrator account, physical access, or social engineering.
- Denial-of-service testing, automated scanning that degrades the service, or spam.
- Self-hosted deployments that are misconfigured or run with the shipped development defaults (for example the local-only `postgres`/`password` credentials described in the development setup docs).

## Security practices for self-hosters

- Never run a public instance with the development defaults. Set strong values for every secret in `.env`, including database, MinIO, Keycloak, and `ENCRYPTION_MASTER_KEY`.
- Keep the server-side API keys (model providers, embedding services) out of per-project configuration and never expose them to the browser.
- Follow the [Self-Hosting](https://docs.chat.illinois.edu/self-hosting/) guide for upgrades, backups, and configuration, and keep your deployment on the latest release.

Thank you for helping keep Illinois Chat and its users safe.
