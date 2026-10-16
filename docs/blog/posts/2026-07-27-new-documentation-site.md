---
date: 2026-07-27
title: Announcing the new Illinois Chat documentation
categories:
  - Announcements
authors:
  - caii
---

Welcome to the new home of the Illinois Chat documentation — built with Material for MkDocs, versioned alongside the code, and published automatically from the [monorepo](https://github.com/Center-for-AI-Innovation/Illinois-Chat).

<!-- more -->

## What's here

- **[Quickstart](../../getting-started/quickstart.md)** — from sign-in to a working, cited assistant in minutes.
- **[Building a Chatbot](../../building/index.md)** — projects, documents, retrieval methods, and LLM providers.
- **[Uploading files](../../building/dashboard/uploading-files.md)** — uploading materials, web crawling, sharing, Sim tools, Canvas, analytics, and bulk export.
- **[API Reference](../../api/index.md)** — chat, retrieval, ingest, and export endpoints with runnable examples.
- **[Self-Hosting](../../self-hosting/index.md)** — the full Docker Compose stack, environment variables, and system architecture.
- **[CropWizard](../../use-cases/cropwizard/index.md)** — the flagship agricultural assistant built on the platform.

## Release notes live here too

This blog is where we'll publish release announcements going forward. Subscribe by watching [releases on GitHub](https://github.com/Center-for-AI-Innovation/Illinois-Chat/releases), and check the **Releases** category here for details on what shipped.

## Contributing

Spotted something wrong or missing? The source lives in `docs/` in the [repository](https://github.com/Center-for-AI-Innovation/Illinois-Chat); open a pull request, or contact support using the address in the page footer.

### How to write a release post

Add a file under `docs/blog/posts/` named `YYYY-MM-DD-short-slug.md`:

```markdown
---
date: 2026-08-15
title: "vX.Y.Z: one-line summary"
categories:
  - Releases
authors:
  - caii
---

A paragraph summarizing the release.

<!-- more -->

## Highlights
- ...

## Breaking changes
- ...
```

Everything above the `<!-- more -->` marker appears in the blog index.
