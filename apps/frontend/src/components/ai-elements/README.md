# Illinois Chat AI Elements

The complete published `@ai-elements/all` registry was added with the shadcn CLI. The existing Base UI primitives were preserved. The copied registry components were adapted to Base UI and AI SDK 7: hover-card timing belongs to triggers, usage lives in token detail objects, and the old SDK 6 TypeScript suppression comments are unnecessary.

The current shadcn patterns also include `stack-trace`, `terminal`, `test-results`, `file-tree`, and `subagent`. Those items are not published in `registry.ai-sdk.dev`; their local implementations compose the new shadcn Trace, Collapsible, Badge, and Code Block primitives.

## Production workspace

`workspace/WorkspaceChat.tsx` connects the new interface to project configuration, conversation history, and persistence. It replaces the old chat surface in `components/home/home.tsx`.

`/api/chat/workspace` loads credentials and enabled models on the server behind the existing project access gate. OpenAI uses Responses; other providers use their native AI SDK adapters. `useChat` consumes the UI message stream directly, retaining ordered reasoning, text, tools, attachments, sources, and provider metadata. Full parts are saved in the existing `processed_content` column; no database migration is required. Existing conversations still load through the legacy content adapter.

Document search is a real SDK tool. Terminal, test, file-change, and subagent displays render only when backend events supply that information; the interface does not fabricate execution.

The route also exposes two presentation tools whose schemas live in `types/workspace.ts`: `updatePlan` renders a Plan card and `createArtifact` streams a document, source file, or HTML page into the artifact panel. HTML artifacts run in an iframe sandboxed with `allow-scripts` only. Message metadata carries the model id, the last step's context tokens, and total usage for the Context meter. Tools that set `needsApproval` render a Confirmation and resume automatically after the user responds.

The workspace theme is scoped to `.ic-workspace` in `styles/globals.css` and uses only the Illinois brand palette and typefaces (Montserrat, Source Sans 3, Georgia).

## Custom backend events

`workspace/RichPart.tsx` validates these UI data parts before rendering:

- `data-terminal`: command, output, running, exitCode
- `data-stack-trace`: error and frames
- `data-test-results`: results and running
- `data-file-tree`: files
- `data-subagent`: name, description, status

Sources, citations, tool states, reasoning, and attachments use standard AI SDK message parts. The workspace composes conversation, message, prompt input, reasoning, shimmer, loader, suggestion, tool, task, plan, confirmation, context, checkpoint, queue, artifact, web preview, image, code block, sources, inline citation, and model selector. The React Flow elements are not installed.

## Preview

`/chat-preview` uses `@shadcn/helpers/ai-sdk` with the real `useChat` lifecycle and scripted messages. It makes no model API requests. Its banner explicitly identifies it as a preview. Use the project chat to exercise configured providers and project knowledge.

References: [AI Elements](https://ui.shadcn.com/docs/ai-elements), [AI SDK helper](https://ui.shadcn.com/docs/helpers/ai-sdk).
