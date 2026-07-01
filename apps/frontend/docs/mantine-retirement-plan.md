# Mantine Retirement — Migration Inventory & Plan

_Generated 2026-07-01 from an automated per-file audit (79 files with live @mantine/mantine-datatable imports) against the existing shadcn/Radix design system. Target: remove Mantine entirely._


---

# Mantine Retirement — Migration Inventory & Plan

**App:** `apps/frontend` (Next.js, shadcn/Radix + Tailwind design system already in place)
**Scope:** 79 audited files that still import from `@mantine/*` or `mantine-datatable`.
**Target system:** existing `src/components/shadcn/ui/*` (56 components present) + `src/components/shadcn/hooks/use-mobile.tsx` + `sonner` + `@tanstack/react-table`.

> **Audit corrections applied throughout (verified against the tree):**
> - `useMediaQuery` replacement lives at **`src/components/shadcn/hooks/use-mobile.tsx`** — the audit's repeated path `ui/hooks/use-mobile.tsx` is wrong.
> - The shadcn **`switch.tsx` already ships the labeled/tooltip/thumb-icon API** (`label`, `tooltip`, `showLabels`, `showThumbIcon`, `variant="labeled"`, `size`). `DeprecatedCustomSwitch.tsx` is a pure delete.
> - **`toggle-group.tsx` exists** — it is the natural basis for `SegmentedControl`, so those files are "adapt existing" not fully "NEW".
> - `sonner` Toaster is **not yet mounted** in `_app.tsx`; `toastUtils.ts` is **still 100% Mantine** — it is the notifications choke point (see §2).
> - All required libs are already dependencies: `sonner`, `use-debounce`, `@tanstack/react-table`, `next-themes`, `react-dropzone` (via `@mantine/dropzone`'s peer — see §2 caveat).

---

## 1. Master API → replacement table

### Core components

| Mantine API | Target | # files | Typical effort | Notes |
|---|---|---|---|---|
| `Text` | native `<p>/<span>` + Tailwind (or a tiny Typography helper) | ~40 | S | By far the most common; trivial except `variant="gradient"` (see Styling). |
| `Title` | native `<h1>–<h6>` + Tailwind | ~25 | S / M | M only where `variant="gradient"` gold→white is used (prompt.tsx, tools.tsx, CanView*/CannotEdit* family). |
| `Button` | `ui/button.tsx` | ~14 | S | Straight swap; watch `component="a"` polymorphism (→ `asChild`) on index.tsx. |
| `Flex` / `Group` / `Stack` / `Center` / `Container` / `Box` | Tailwind flex/grid divs | ~25 | S | Pure layout; `Group position="apart"` → `justify-between`. |
| `Card` (+ `Card.Section`) | `ui/card.tsx` | ~14 | S / M | `Card.Section` has no direct slot → nested div; `component="a"` on index.tsx is M. |
| `Tooltip` | `ui/tooltip.tsx` | ~14 | S / M | Radix API differs (`side`/`align`/`sideOffset` vs `position`/`withArrow`/`multiline`/`width`). |
| `Switch` | `ui/switch.tsx` | ~9 | S | Already feature-complete incl. labeled variant; `styles` track-color → className/CSS var. |
| `Modal` (compound) | `ui/dialog.tsx` (or `ui/sheet.tsx` / `ui/alert-dialog.tsx`) | ~9 | M / L | Compound `Modal.Root/Overlay/Content/Header/Title/CloseButton/Body` → Radix Dialog parts. |
| `Select` | `ui/select.tsx` | ~9 | M / L | L where `itemComponent` (forwardRef), grouped options, or `searchable` used. |
| `TextInput` / `Input` | `ui/input.tsx` / `ui/form-input.tsx` / `ui/input-group.tsx` | ~12 | S / M | M whenever `icon` prop is used → `ui/input-group.tsx`. |
| `Textarea` | `ui/textarea.tsx` | ~5 | S / M | `minRows` → CSS/rows attr. |
| `Table` | `ui/table.tsx` (+ `@tanstack/react-table`) | ~5 | S / M / L | Simple striped tables are M; DocGroupsTable is L (global CSS selectors). |
| `Badge` | `ui/badge.tsx` | ~4 | S | color/variant → className. |
| `Accordion` (compound) | `ui/accordion.tsx` | 2 | M | `disableChevronRotation`, custom chevron are Mantine-only. |
| `Slider` | `ui/slider.tsx` | 2 | M | `marks`, `showLabelOnHover`, label formatter need wrapper. |
| `Tabs` (compound) | `ui/tabs.tsx` | 1 | M | `[data-active]` → `[data-state=active]`. |
| `Divider` | `ui/separator.tsx` | ~5 | S | |
| `ActionIcon` | `ui/button.tsx` (`variant="ghost" size="icon"`) | ~6 | S | |
| `Progress` | `ui/progress.tsx` | 1 | S | |
| `Collapse` | `ui/collapsible.tsx` | ~4 | S / M | |
| `Avatar` | `ui/avatar.tsx` | 1 | S | gradient bg → className. |
| `Menu` (compound) | `ui/dropdown-menu.tsx` | 1 | M | AuthMenu — plus pseudo-element shine effect. |
| `Burger` / `Transition` | Tabler icon button / `ui/sheet.tsx` or framer-motion | 3 | S / M | Navbars. |
| `List` / `List.Item` | native `<ul>/<li>` (or `ui/item.tsx`) | ~6 | S / M | `ApiKeyManagament` uses custom icon slot (M). |
| `Image` | `next/image` (often already imported) | ~5 | S | |
| `Paper` | `ui/card.tsx` or div | ~7 | S | |
| `SimpleGrid` | Tailwind `grid grid-cols-*` | 2 | S | |
| `Code` | styled `<code>` (or NEW `ui/code`) | 1 | S | ProjectFilesTable. |
| `UnstyledButton` | `<button>` reset / ghost button | 1 | S | |
| `Input.Description` | `<p>`/`<span>` or `ui/form` desc | 1 | S | |

**No existing shadcn equivalent — must BUILD:**

| Mantine API | # files | Effort | Build recommendation |
|---|---|---|---|
| **`CopyButton`** | 3 (LinkGeneratorModal, ProjectFilesTable, CustomCopyButton pattern) | M | NEW `useCopyToClipboard` hook + `ui/button` wrapper. Shared util. |
| **`SegmentedControl`** | 2 (WebScrape, WebsiteIngestForm) | L | Build on existing **`ui/toggle-group.tsx`** (single-select) — not fully from scratch. |
| **`MultiSelect`** | 1 (ProjectFilesTable) | L | NEW — `ui/select` has no multi mode; build with `command.tsx` + badges. |
| **`Indicator`** | 3 (ProjectFilesTable, PromptEditor, PromptEditorEmbed) | M | NEW small wrapper: `ui/badge` absolutely positioned. |
| **`Dropzone`** (+ `.Accept/.Reject/.Idle`) | 1 (LargeDropzone) | L | NEW wrapper over `react-dropzone`; render-prop states → local state. **See dep caveat in §2.** |
| **Gradient text** (`variant="gradient"`) | ~8 | S each | NEW shared class/component (`bg-clip-text` gold→white). One-time util unblocks the whole CanView*/CannotEdit*/Context/Citation/prompt/tools family. |
| **`Input` `icon` prop pattern** | ~7 | M each | Use existing **`ui/input-group.tsx`** — pattern exists, needs consistent adoption. |

### Hooks

| Mantine hook | Target | # files | Effort |
|---|---|---|---|
| `useMediaQuery` | **`src/components/shadcn/hooks/use-mobile.tsx`** (exists) | ~15 | S |
| `useMantineTheme` | remove — CSS vars / Tailwind tokens (frequently imported-but-unused) | ~8 | S |
| `useDisclosure` | `useState` | 4 | S |
| `useDebouncedState` / `useDebouncedValue` | `use-debounce` (installed) | 2 | S |
| `useClipboard` | native `navigator.clipboard` / shared `useCopyToClipboard` | 1 | S |

### Notifications

| Mantine API | Target | # files | Effort |
|---|---|---|---|
| `notifications.show` / `showNotification` | **`sonner`** via `src/utils/toastUtils.ts` wrapper | ~14 (direct) + all callers of `toastUtils` | S–M |
| `<Notifications>` component (in `_app.tsx`) | `ui/sonner.tsx` `<Toaster>` (**not yet mounted**) | 1 | S |

### Dates

| Mantine API | Target | # files | Effort |
|---|---|---|---|
| `DatePickerInput` (`@mantine/dates`) | `ui/calendar.tsx` + `ui/popover.tsx` | 1 (MakeQueryAnalysisPage) | M |

### Dropzone

| Mantine API | Target | # files | Effort |
|---|---|---|---|
| `Dropzone` + `.Accept/.Reject/.Idle` (`@mantine/dropzone`) | NEW wrapper over `react-dropzone` | 1 (LargeDropzone) | L |

### Datatable

| Mantine API | Target | # files | Effort |
|---|---|---|---|
| `DataTable` (`mantine-datatable`) | `@tanstack/react-table` + `ui/table.tsx` | 2 (ProjectFilesTable, N8nWorkflowsTable) | L each |

### Styling (createStyles / sx / theme)

| Concern | Target | # files | Effort |
|---|---|---|---|
| `createStyles` | Tailwind classes + CSS modules; keep CSS vars | 17 | M avg |
| `sx` prop | Tailwind className (conditional via `cn()`) | 16 | S–M |
| `useTheme`/`theme.*` tokens (`radius`, `spacing`, `shadows`, `fontSizes`, `colors`, `fn.smallerThan`) | Tailwind tokens / CSS vars; `theme.fn.*` → Tailwind breakpoints | ~24 | S–M |
| `rem()` | Tailwind spacing / `calc()` | ~7 | S |
| `MantineTheme` type import | delete | ~5 | S |

### Provider

| Mantine API | Target | # files | Effort |
|---|---|---|---|
| `MantineProvider` | remove; `next-themes` + Tailwind | 3 (`_app.tsx`, `renderWithProviders.tsx`, `KeycloakProvider` uses nothing of it) | M |
| `withGlobalStyles` / `withNormalizeCSS` | drop (Tailwind preflight) | 2 | S |

---

## 2. Foundational / shared work (do first, regardless of per-file order)

These are cross-cutting enablers. Several files can't be *finished* until these land, and doing them first removes friction from every leaf swap.

### A. Notifications → sonner — the single biggest unblock
`src/utils/toastUtils.ts` is the **choke point**. It is still 100% `@mantine/notifications` today, but many files already call `errorToast()`/`showToast()` through it (Chat.tsx, MakeNewCoursePage, several ingest forms). **Rewrite `toastUtils.ts` internally to call `sonner`'s `toast()` while keeping its public `showToast()/ToastType` interface identical.** That one file flips every indirect caller at once.

Then handle the ~14 files that call `notifications.show` / `showNotification` **directly** (GitHubIngestForm, N8NPage, WebScrape, WebsiteIngestForm, ApiKeyManagament, ProjectFilesTable, N8nWorkflowsTable, MakeQueryAnalysisPage, newsletter-unsubscribe, LLMsApiKeyInputForm, PromptEditor(+Embed), MakeNewCoursePage) — route each through the wrapper rather than sonner directly, to preserve consistent styling.

**Blocker to fix first:** `ui/sonner.tsx` `<Toaster>` is **not mounted** anywhere. Mount it in `_app.tsx` (it can coexist with the Mantine `<Notifications>` during migration). Order: mount Toaster → rewrite `toastUtils.ts` → migrate direct callers → remove `<Notifications>` in the final app-shell step.

### B. Theme / createStyles strategy (decide once, apply everywhere)
17 files use `createStyles`, 16 use `sx`, ~24 touch `theme.*`. Establish the convention up front so 33 files don't each invent their own:
- Layout/spacing/radius/shadow tokens → **Tailwind utilities**.
- Complex/pseudo-selector/keyframe rules → **CSS modules** co-located with the component.
- **Keep existing CSS custom properties** (`--dashboard-*`, `--modal`, `--sidebar-background`, `--notification`, etc.) — they already work in both systems and port cleanly via Tailwind arbitrary values `bg-[var(--modal)]`.
- `theme.fn.smallerThan/largerThan` (navbars) → Tailwind breakpoints or `use-mobile`.
- **Ship the gradient-text helper here** (one shared `bg-clip-text` gold→white component/class) — it alone unblocks ~8 files.

### C. Shared primitives to build once (before the files that need them)
- `useCopyToClipboard` hook + copy-button wrapper → unblocks CustomCopyButton, LinkGeneratorModal, ProjectFilesTable.
- `Indicator` wrapper (badge + absolute position) → unblocks ProjectFilesTable, PromptEditor(+Embed).
- Standardize on **`ui/input-group.tsx`** for the `Input.icon` pattern (~7 files).

### D. mantine-datatable → @tanstack/react-table
`@tanstack/react-table` is already a dep. Build/confirm a reusable data-table wrapper around `ui/table.tsx` (columns, sorting, pagination, row styling, fetching state) **once**, then apply to the 2 consumers (ProjectFilesTable, N8nWorkflowsTable). Don't port the DataTable API twice.

### E. App-shell / Provider removal — MUST BE LAST
`MantineProvider` in `src/pages/_app.tsx` **cannot be removed until every component is off Mantine** — any remaining Mantine component throws without the provider. Dependency order:

```
Mount sonner Toaster + rewrite toastUtils      (early, non-breaking)
        │
   migrate ALL leaf/medium/hard components off @mantine/*
        │
   ▼ (only when zero @mantine/* imports remain in rendered tree)
Remove <Notifications> + <MantineProvider> from _app.tsx
Remove MantineProvider from src/test-utils/renderWithProviders.tsx
Drop @mantine/* + mantine-datatable from package.json
```
`renderWithProviders.tsx` and `KeycloakProvider.tsx` are trivial and can be done in the same final PR (KeycloakProvider only uses `Flex`/`Title`, no provider dependency).

> **Dep caveat for §1 Dropzone:** `react-dropzone` is currently only present transitively via `@mantine/dropzone`. Add it as a **direct** dependency before/while migrating LargeDropzone so removing `@mantine/dropzone` doesn't break the import.

---

## 3. Recommended incremental order (one-by-one, grouped into PR-sized units)

### Phase 0 — Foundations (2–3 PRs, do before leaves)
1. **PR: sonner enablement** — mount `<Toaster>` in `_app.tsx`; rewrite `src/utils/toastUtils.ts` to sonner (keep interface). Update the test mock `src/components/UIUC-Components/api-inputs/__tests__/LLMsApiKeyInputForm.test.tsx`.
2. **PR: shared primitives** — gradient-text helper, `useCopyToClipboard`+copy button, `Indicator` wrapper, confirm `use-mobile` + `input-group` conventions. Add `react-dropzone` as direct dep.
3. **PR: reusable data-table** — `@tanstack/react-table` wrapper around `ui/table.tsx`.

### Phase 1 — Low-risk leaves (pure swaps, only existing shadcn; start here)
Group into a few PRs by folder:

- **PR: delete DeprecatedCustomSwitch** — `src/components/Switches/DeprecatedCustomSwitch.tsx` — the shadcn `switch.tsx` is already a superset; replace callers and delete the file. (S)
- **PR: static text/gradient pages** — `CanViewOnlyCourse.tsx`, `CannotEditCourse.tsx`, `CannotEditGPT4.tsx`, `CannotViewCourse.tsx`, `Maintenance.tsx`, `StuffMessageWithContext.tsx`, `SourcesSidebar.tsx`, `ModelUsageChart.tsx`, `ConversationsHeatmapByHourChart.tsx`, `ConversationsPerDayOfWeekChart.tsx`, `ConversationsPerHourChart.tsx` (all under `src/components/UIUC-Components/`). Text/Title/Flex + gradient only. (all S)
- **PR: import cleanup only** — `src/pages/disclaimer.tsx` (unused `Group`), `src/pages/privacy.tsx`, `src/pages/terms.tsx` (dead commented imports), `Explore.tsx` (unused `useMediaQuery`), `ModelParams.tsx` (dead `createStyles`). (all S)
- **PR: tooltip/leaf swaps in Chat & Sidebar** — `MessageActions.tsx`, `Folder/Folder.tsx`, `Sidebar/Sidebar.tsx`, `Chatbar/Chatbar.tsx` (`useDebouncedState`→use-debounce). (all S)
- **PR: simple page layouts** — `src/pages/[course_name]/api.tsx`, `src/pages/[course_name]/upload.tsx`, `src/providers/KeycloakProvider.tsx`, `MakeOldCoursePage.tsx`, `StepUpload.tsx` (SimpleGrid→grid), `cropwizard-licenses.tsx`. (all S)
- **PR: simple cards/typography** — `Dashboard.tsx`, `DocumentGroupsCard.tsx`, `NomicDocumentsMap.tsx`, `PermissionGate.tsx`, `ResumeToChat.tsx`, `SupportedFileUploadTypes.tsx`, `Maintenance` sibling forms. (S)

### Phase 2 — Medium units (component swaps + some styling)
Pick up as coherent PRs:

- **PR: Chat controls** — `FancyRetrieval.tsx`, `ChatInput.tsx`, `ToolsItem.tsx`, `DocumentGroupsItem.tsx`, `ModelSelect.tsx`, `Temperature.tsx` (Select/Switch/Slider/Table with styles props). (M)
- **PR: simple ingest forms** — `MITIngestForm.tsx`, `CourseraIngestForm.tsx`, `CanvasIngestForm.tsx` (Input.icon→input-group; Dialog already shadcn). (M)
- **PR: charts w/ switch** — `ConversationsPerDayChart.tsx`. (M)
- **PR: image/citation** — `ImagePreview.tsx` (Modal+keyframe), `CitationCard.tsx`, `ContextCards.tsx`. (M)
- **PR: accordion** — `IntermediateStateAccordion.tsx` (custom chevron/rotation), then its consumer `N8NPage.tsx`. (M)
- **PR: navbars** — `navbars/GlobalHeader.tsx` (mostly done; note **bug at line ~268 `IconClipboardTexts`→`IconClipboardText`**), `navbars/ChatNavbar.tsx`, `navbars/Navbar.tsx`, `navbars/AuthMenu.tsx` (Menu→dropdown-menu + shine pseudo-element). (M)
- **PR: NavigationSidebar** — `Sidebar/NavigationSidebar.tsx` (11-class createStyles → CSS module). (M)
- **PR: API key + course pages** — `ApiKeyManagament.tsx`, `MakeNewCoursePage.tsx`, `index.tsx` (Card polymorphic `component="a"`), `DocumentsCard.tsx`, `LLMsApiKeyInputForm.tsx`, `UploadCard.tsx`, `UploadNotification.tsx`. (M)
- **PR: gradient title pages** — `[course_name]/prompt.tsx`, `[course_name]/tools.tsx` (uses gradient helper from Phase 0). (M)
- **PR: LinkGeneratorModal** — Modal + CopyButton (uses Phase-0 primitives). (M)

### The ~7 hardest files (dedicated PR each — forms, tables, theme/createStyles-heavy)

1. **`src/components/UIUC-Components/DocGroupsTable.tsx`** (L) — *heaviest.* `createGlobalStyle` (styled-components) hardcoding `.mantine-*` dark-theme selectors that **stop working** the moment Mantine is gone; must be fully rewritten. Table → tanstack wrapper, ScrollArea.Autosize, Tooltip arrow props. Audit console.logs.
2. **`src/components/UIUC-Components/ProjectFilesTable.tsx`** (L) — `mantine-datatable` + `MultiSelect` (NEW) + `Indicator` (NEW) + `CopyButton` (NEW) + `Modal` + `createStyles`/`sx`/`theme.colors.*`. Depends on nearly all Phase-0 primitives.
3. **`src/components/UIUC-Components/N8nWorkflowsTable.tsx`** (L) — `mantine-datatable` (sorting/pagination/custom rows/fetch state) → tanstack; Switch styles; notifications.
4. **`src/components/UIUC-Components/APIRequestBuilder.tsx`** (L) — form builder; grouped+searchable `Select`, `Slider` label formatter, `theme.fontFamily/radius` callbacks, WCAG aria fixes.
5. **`src/components/UIUC-Components/LargeDropzone.tsx`** (L) — only `@mantine/dropzone` consumer; build render-prop `Accept/Reject/Idle` state over `react-dropzone`; `createStyles`. (Needs direct `react-dropzone` dep.)
6. **`src/components/UIUC-Components/PromptEditor.tsx`** & **`PromptEditorEmbed.tsx`** (L, L) — huge, heavy `sx` on Select/Textarea/Modal, `theme.colors.*` scattered, `Indicator`, `useDisclosure`, multiple toasts, customized `Select.itemComponent`. Embed already has Button on shadcn. Do them back-to-back to reuse patterns.
7. **`src/components/UIUC-Components/MakeQueryAnalysisPage.tsx`** (L) — `createStyles` + multiple styled `Select` + **`DatePickerInput`** (only `@mantine/dates` file → calendar+popover) + notifications + `MantineTheme` types.
8. **`src/components/Chat/ChatMessage.tsx`** (L) — largest Chat file; `createStyles` + `sx` + extensive `Modal` (FilePreview + Feedback) + Badge/Tooltip throughout. Pairs with **`FeedbackModal.tsx`** (L) — extract its dialog once and reuse.

*(WebScrape.tsx and WebsiteIngestForm.tsx are also L — both need the `SegmentedControl` built on `toggle-group`; do them together right after the SegmentedControl primitive lands.)*

### Phase 3 — App-shell teardown (final PR, only when zero `@mantine/*` remain)
`src/pages/_app.tsx` (remove `MantineProvider` + `<Notifications>`), `src/test-utils/renderWithProviders.tsx`, then delete `@mantine/*` + `mantine-datatable` from `package.json`.

---

## 4. Counts / summary

**Total audited files: 79** (78 with active Mantine imports + `privacy.tsx`/`terms.tsx` which are cleanup-only; 1 test file).

**By `overallEffort`:**
| Effort | Count | Examples |
|---|---|---|
| **S** | 42 | static pages, chart error-states, leaf tooltips, hooks-only, page layouts, provider/test cleanup |
| **M** | 24 | ingest forms, navbars, cards, `_app.tsx`, Select/Modal singles, gradient title pages |
| **L** | 13 | DocGroupsTable, ProjectFilesTable, N8nWorkflowsTable, APIRequestBuilder, LargeDropzone, PromptEditor(+Embed), MakeQueryAnalysisPage, ChatMessage, FeedbackModal, WebScrape, WebsiteIngestForm |

**By migration nature:**
- **Pure swap (only existing shadcn / native HTML, no new code):** ~46 files. All-S leaf group, layout-only pages, tooltip/button/switch/card swaps, hook swaps.
- **Need NEW component/primitive:** ~13 files depend on something not yet built — `CopyButton` (3), `SegmentedControl` (2, on toggle-group), `MultiSelect` (1), `Indicator` (3), `Dropzone` (1), gradient-text (~8, overlapping), tanstack data-table (2). Once the shared primitives from Phase 0 land, most of these downgrade to "swap."
- **Need styling rewrite (createStyles/sx/theme port beyond a trivial swap):** ~20 files.

**Styling-coupling file counts (drive Phase-0 strategy):**
- `usesCreateStyles: true` → **17 files**: CustomCopyButton(*sx only, listed separately*), ChatMessage, FeedbackModal, ImagePreview, ModelParams (dead), UserSettings, NavigationSidebar, DocumentsCard, GitHubIngestForm, DocGroupsTable, LargeDropzone, ResumeToChat, SupportedFileUploadTypes, UploadCard, AuthMenu, ChatNavbar, GlobalHeader, Navbar, MakeQueryAnalysisPage, ProjectFilesTable. *(counting `createStyles` usages: 17 with `usesCreateStyles:true`.)*
- `usesSx: true` → **16 files** (CustomCopyButton, ChatMessage, FeedbackModal, DocumentGroupsItem, LinkGeneratorModal, ContextCards, ConversationsPerDayChart, Canvas/Coursera indirect, DocGroupsTable, ProjectFilesTable, PromptEditor, PromptEditorEmbed, WebScrape, WebsiteIngestForm, LLMsApiKeyInputForm, UploadCard, prompt.tsx, tools.tsx).
- `usesTheme: true` (`theme.*` / `useMantineTheme` / `MantineTheme`) → **~24 files**.

**Notifications reach:** 14 files with direct `notifications.show`/`showNotification`, **all funnel-able through the single `src/utils/toastUtils.ts` rewrite** plus the `_app.tsx` Toaster mount — the highest-leverage foundational change.

**Single-consumer specials (each gates a dep removal):** `@mantine/dropzone` → LargeDropzone only; `@mantine/dates` → MakeQueryAnalysisPage only; `mantine-datatable` → ProjectFilesTable + N8nWorkflowsTable only.