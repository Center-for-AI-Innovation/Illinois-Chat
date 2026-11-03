# Project Conventions

## Component Organization

- If a new feature has 3+ components that are only used together, group them in a **kebab-case folder** under `src/components/UIUC-Components/` (e.g. `chatbots-hub/`, `analytics-charts/`).
- Colocate the types file inside the feature folder (e.g. `chatbots-hub/chatbots.types.ts`).
- Don't add new files directly to `UIUC-Components/` root if they belong to a feature group.
- Don't create `index.ts` barrel files unless a folder is widely imported from many places.

## File Naming

| What                | Convention              | Example                         |
| ------------------- | ----------------------- | ------------------------------- |
| Component files     | PascalCase              | `ChatbotHubCard.tsx`            |
| Hook files          | camelCase, `use` prefix | `useFetchAccessibleChatbots.ts` |
| Type/constant files | kebab-case              | `chatbots.types.ts`             |
| Utility files       | camelCase               | `apiUtils.ts`                   |
| Pages               | kebab-case              | `chatbots.tsx`                  |
| Feature folders     | kebab-case              | `chatbots-hub/`                 |

## Imports

- **Within the same feature folder**: use relative imports (`./ChatbotHubCard`).
- **Cross-feature or cross-directory**: use the `~/` alias (`~/components/UIUC-Components/chatbots-hub/ChatbotsSection`).

## React Query Hooks (`src/hooks/queries/`)

- One hook file per resource/endpoint.
- Export both the raw fetch function (for non-component use) and the React Query hook.
- Declarative fetching: `useQuery` hooks.
- Imperative actions (event handlers): `useMutation` with `mutateAsync`.

```ts
// Raw fetch function (exported for non-component use)
export async function fetchSomething(): Promise<SomeType[]> { ... }

// React Query hook (exported for components)
export function useFetchSomething({ enabled = true } = {}) {
  return useQuery({ queryKey: ['something'], queryFn: fetchSomething, ... })
}
```

## Styling

- Always use **shadcn/ui** components (`Button`, `Card`, `Badge`, etc.) instead of raw HTML elements or Mantine equivalents when a suitable primitive exists.
- Prefer **CVA (class-variance-authority)** for variant-based styling over inline conditional class concatenation. Define variants declaratively, then select them via props.

```tsx
// Good — CVA
const cardVariants = cva('rounded-[14px] bg-white', {
  variants: {
    role: {
      owner: 'border-2 border-[--illinois-orange-branding]',
      member: 'border border-[#e5e7eb] shadow-md',
    },
  },
})
<Card className={cardVariants({ role })} />

// Avoid — inline ternary
<Card className={`... ${isOwner ? 'border-orange' : 'border-gray shadow'}`} />
```

## Pages

- Pages should be thin: auth checks, route params, and composing components.
- Heavy logic lives in components or hooks, not in the page file.

## Types

- **Feature-scoped types**: colocate in the feature folder (`chatbots-hub/chatbots.types.ts`).
- **Shared/global types**: put in `src/types/` (`courseMetadata.ts`, `chat.ts`).
- If a type is used across features, promote it to `src/types/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
