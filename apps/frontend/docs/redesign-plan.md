# Illinois Chat Redesign — Implementation Plan

This plan covers moving the whole frontend onto the new Illinois Chat design.

**Design sources (Figma)**
- Screens: [Illinois.Chat](https://www.figma.com/design/uOvStAqvMso6iCGJ5AV7HK/Illinois.Chat). The pilot page is the
  "AI Models" section, node `2445-33636`.
- Component library: [Illinois Chat shadcn Official](https://www.figma.com/design/cNT8WmeLqGDKceb2uUzNLR/Illinois-Chat-shadcn-Official).
  It has one page per primitive: Switch `60:438`, Button `34:6`, Input `65:520`, Select `118:1264`,
  Separator `118:2682`, Avatar `23:988`, and others.

**Approach**: work bottom-up and one module at a time. Global tokens come first, then the shared primitives, then a
new admin layout piloted on a single page, then the remaining pages one at a time. Each step is a reviewable
checkpoint.

---

## Principles

- **Restyle, don't rebuild.** Every primitive already exists under `src/components/shadcn/ui/`, built on Base UI.
  Change their CVA variants and classes in place; don't add parallel components.
- **Tokens are global.** The theme values in `src/styles/globals.css` change for the whole app. Legacy pages pick up
  the new look automatically, with no code changes on their side.
- **Primitive defaults match Figma.** Variants that only legacy code uses, such as Button `dashboard`/`danger` and
  Switch `labeled`, stay until their last caller has moved.
- **Pilot first.** New layouts are built at a new route next to the old page. The old page is replaced only after
  the new one is approved.
- **Follow `apps/frontend/CLAUDE.md`.** Use shadcn primitives, CVA for variants, and kebab-case feature folders.
  Keep pages thin.

---

## Phase 0 — Tokens, radius, font ✅ done

- **Color tokens.** The semantic tokens in the unlayered `:root` of `globals.css` now hold the Figma values: primary
  navy `#13294b`, foreground `#081735`, border/input `#e5e5e5`, muted `#f2f2f2` with text `#9a9d9c`, plus the
  `card`, `popover` and `sidebar-*` sets.
- **Dark mode.** Every token pinned to a hex value has an explicit `.dark` value: Figma's where the design defines
  one, otherwise derived from `--foreground`/`--background`.
- **Dead CSS removed.** The `@layer base` HSL block is gone. Every color token is now a complete value, so Tailwind
  references them as bare `var(--x)`, never `hsl(var(--x))`.
- **Radius.** `--radius: 0.625rem`, giving a 6 / 8 / 10 / 14px scale (sm / md / lg / xl).
- **Font.** Source Sans 3 is Tailwind's `font-sans`. It's loaded in `fonts.ts` and exposed on `:root` from
  `_app.tsx`, so portalled content inherits it too. Explicit Montserrat headings are unchanged.
- **Brand colors unchanged.** The Illinois brand palette (`--illinois-*`) and the `--dashboard-*` tokens are left as
  they are.

---

## Phase 1 — Primitives

Each primitive is its own checkpoint. For each one:
1. Pull the variant matrix from its library page.
2. Update the CVA classes.
3. Add class-assertion tests.
4. Screenshot a sample of the existing callers.

| Primitive | File | Key changes |
|---|---|---|
| Switch | `switch.tsx` | 36×20 track with a 16px thumb is the default (`sm`); focus ring; ref type `HTMLElement` |
| SwitchField (new) | `switch-field.tsx` | Label, description, side and box variants, composed from `field.tsx` |
| Button | `button.tsx` | `default` h-9, `shadow-xs`; `sm` already matches |
| Input / Label | `input.tsx`, `label.tsx` | `px-3`, `bg-background`, 6px gap between label and field |
| Select | `select.tsx` | Trigger `px-3 gap-2`; popup and items restyled |
| Separator | `separator.tsx` | Token-driven; horizontal and vertical |
| Alert | `alert.tsx` | `destructive` description uses full `text-destructive` |
| Card | `card.tsx` | Border plus `shadow-sm` instead of a ring; `rounded-xl`; title semibold |
| Avatar | `avatar.tsx` | Round size-8; square `rounded-lg` variant |
| Sidebar | `sidebar.tsx` | Menu, sub-menu and sub-item sizing; active item uses `bg-sidebar-accent` |
| Breadcrumb | `breadcrumb.tsx` | text-sm foreground |

Other primitives in the library (Checkbox, Dropdown Menu, Table, Textarea, Badge, Drawer, Calendar, Chart) follow
the same process when a migrated page first needs them.

---

## Phase 2 — Admin layout (piloted on AI Models)

New feature folder: `src/components/UIUC-Components/admin-layout/`.

- **`GlobalNav`**: wordmark, ghost nav buttons ("Chatbots Hub", "Create Your Own Bot"), avatar, separator.
- **`AdminSidebar`**: built from the shadcn `Sidebar*` primitives. Below the breakpoint it falls back to a mobile
  Sheet.
- **`SubPageHeader`**: sidebar trigger, vertical separator, breadcrumb.
- **`AdminLayout`**: composes the three above around the page content.

**The sidebar is generated from data.** Each admin page is a top-level item, and that page's section headings
become its sub-items.

- One registry, `admin-layout/admin-pages.ts`, lists the pages as `{ title, icon, href, sections? }`.
- Each page keeps its own section list next to it (for example `ai-models/ai-models.sections.ts`) and renders its
  headings from that same array. The sidebar and the headings therefore can't drift apart.
- Sub-items link to `href#section-id`. Headings carry `id` and `scroll-mt-*`. The active state comes from the route
  and the hash; the hash is read after mount and updated on `hashChangeComplete`.
- While pages are being migrated, the sidebar lists only pages that exist today: Dashboard, AI Models, Analysis,
  Prompting, Tools, API. Groups gain sub-items as their pages migrate.

---

## Phase 3 — Page migrations

Every page goes through the same steps:

1. Build the new version at a new route that uses `AdminLayout`, with feature composites in a kebab-case folder.
2. Reuse the existing React Query hooks. Rebuild only the presentation layer.
3. Copy the page's auth gating: `PermissionGate`, metadata 401/403/404 handling, and special-course guards.
4. Verify it against the Figma frames in light and dark mode, on desktop and at 375px.
5. After approval, swap the routes. Move any shared helpers out of the old components, then delete what's unused.

### Pilot: AI Models (`/[course_name]/ai-models`, replaces `/llms`)

- **Composites** (`ai-models/`): `AIModelsProviderCard`, `ProviderField`, `ModelListItem`, `DefaultModelCard`.
- **Data**: `useAIModelsSettings` is called once, in the page. It wraps `useFetchLLMProviders` and
  `useUpdateProjectLLMProviders`.
  - Each action writes the query cache first, then sends a cumulative payload with `mutateAsync`.
  - A `latestRef` stops refetches from dropping pending changes; the shared mutation is debounced by 1s.
- **Saving**: provider switches, model switches and the default-model select auto-save. API keys and URLs are drafts
  local to their card and save only on **Save**.
- **Before `/llms` can be removed**:
  - Move `findDefaultModel`, `showConfirmationToast` and `APIKeyInput` out of `LLMsApiKeyInputForm.tsx`. They're
    used by PromptEditor, APIRequestBuilder and the provider inputs.
  - Re-point or keep `APIKeyInputForm` for the new-project wizard (`StepLLM`).

### Remaining pages, in the order they're expected to migrate

| Page | Route today | Notes |
|---|---|---|
| Dashboard | `/[course_name]/dashboard` | Upload, integrations, branding. Large page; may be split into the design's "Project Data" / "Project Identity" groups |
| Prompting | `/[course_name]/prompt` | System prompt, behavior settings |
| Tools | `/[course_name]/tools` | |
| Analysis | `/[course_name]/analysis` | Charts: use the library's Chart page |
| API | `/[course_name]/api` | |
| Chat | `/[course_name]/chat` | Not an admin page, so it needs its own layout pass |
| Chatbots hub, home | `/chatbots`, `/` | Global nav reuse |

When the design's own groupings (Project Data, Project Identity, User Access and Sharing) are ready, add them to the
registry and retire `NavigationSidebar` and `SettingsLayout`.

---

## Verification (every checkpoint)

- Commands: `npm run test`, `npm run test:a11y`, `npx tsc --noEmit`, `npm run lint`. The repo has existing
  `tsc` errors in test files; judge only the files you touched.
- New or changed defaults get class-assertion tests. Data hooks get MSW tests (`src/test-utils/renderWithProviders.tsx`).
- Screenshot the affected pages before and after, in light and dark mode. Wait for transitions to finish before
  capturing (sidebar and buttons use `transition-all duration-300`).
- Pages that render something global (tokens, defaults) should get a quick visual pass: chat, dashboard, `/llms`,
  the chatbots hub, and modals.

## Out of scope / known issues

- `_app.tsx` creates `new QueryClient()` inside the component body, so it's recreated on every render. This is a
  pre-existing bug.
- `next-themes` is installed but unused; the app uses `src/contexts/ThemeContext.tsx`.
