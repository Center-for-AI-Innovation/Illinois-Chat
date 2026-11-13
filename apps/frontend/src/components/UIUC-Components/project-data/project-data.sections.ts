import { type AdminPageSection } from '../admin-layout/admin-pages.types'

// Rendered as the page's section headings AND as the page's sub-items in the
// admin sidebar, so the two cannot drift apart.
export const PROJECT_DATA_SECTIONS = [
  { id: 'document-upload', title: 'Document Upload' },
  { id: 'integrations', title: 'Integrations' },
  { id: 'document-groups', title: 'Document Groups' },
  { id: 'project-files', title: 'Project Files' },
] as const satisfies readonly AdminPageSection[]
