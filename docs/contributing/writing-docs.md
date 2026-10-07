# Writing docs

The documentation is a [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) site: pages in `docs/`, navigation in `mkdocs.yml`, theme overrides in `overrides/`. Branch from `main` and open a pull request into `main`; a merge publishes the site through the docs workflow ([Testing & CI](testing-ci.md)).

!!! note "Until #194 merges"
    The site is still being developed on the `docs-site` branch (PR #194). Until that PR merges, branch from and open PRs into `docs-site`.

## Preview and build

No local install is needed beyond [uv](https://docs.astral.sh/uv/):

```bash
uv run --only-group docs mkdocs serve           # http://127.0.0.1:8000/
uv run --only-group docs mkdocs build --strict
```

The strict build must finish with zero warnings; pull requests that touch the docs run the same build as a check. It fails on broken links, broken `#anchors`, missing images and pages absent from `nav`. Blog posts dated in the future are drafts: `serve` renders them, `build` omits them and does not check their links.

## Structure

- **One page per product screen** in *Building a Chatbot*; put a fact on the page that owns it and link there from everywhere else rather than repeating it.
- **Sections vs pages**: a `nav` entry with children is a section. Give a section an index page only when there is something to say about the section as a whole, list that index **first** among its children (the tab lands on the first child), and note that with `navigation.indexes` the index page does not appear in the sidebar list.
- **Headings** nest in order (no H3 directly under H1); every page has exactly one H1.
- **Admonitions** (`!!! note "Title"`) for asides; keep them to a few lines.
- **Images** go in `docs/assets/` at ≤ 300 KB and ≤ 1600 px wide, light theme, with no personal data; prefer prose over a screenshot that will go stale.
- **Diagrams** use Mermaid fenced blocks (` ```mermaid `).

## Style checklist

- Describe what the code on `main` does. Research ideas go under a heading labelled "Research ideas (not in the product)" or are left out.
- The hosted site at chat.illinois.edu is an example, not an instruction ("the hosted site uses `illinois.edu`").
- No "we" or "our" in user-facing text, and no internal reasons for a policy.
- Users are told to "contact support using the address in the page footer"; no `mailto:` links in page bodies, no per-page help sections, and never GitHub issues on user-facing pages. Operator and contributor pages may name the repository.
- Pages about Sim cite the pinned release and the current docs.sim.ai, as the two Sim guides do.
- Make the smallest change that makes a statement true; delete a duplicate rather than syncing it.

## Dependencies

The toolchain is the `docs` dependency group in the root `pyproject.toml`, locked in the root `uv.lock`. To upgrade, bump `mkdocs-material` there, run `uv lock`, confirm `uv run --only-group docs mkdocs build --strict` passes, and commit both files.
