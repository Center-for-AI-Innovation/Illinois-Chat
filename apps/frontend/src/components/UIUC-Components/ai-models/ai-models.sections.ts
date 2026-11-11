import { type AdminPageSection } from '../admin-layout/admin-pages.types'

// Rendered as the page's section headings AND as the page's sub-items in the
// admin sidebar, so the two cannot drift apart.
export const AI_MODELS_SECTIONS = [
  { id: 'default-model', title: 'Set the Default Model' },
  { id: 'open-source', title: 'Open Source LLMs' },
  { id: 'closed-source', title: 'Closed Source LLMs' },
] as const satisfies readonly AdminPageSection[]
