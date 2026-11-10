import { type LucideIcon } from 'lucide-react'

export interface AdminPageSection {
  id: string
  title: string
}

export interface AdminPage {
  title: string
  icon: LucideIcon
  /** Route segment under /[course_name]/, e.g. "ai-models". */
  path: string
  /** The page's section headings; shown as sidebar sub-items. */
  sections?: readonly AdminPageSection[]
}
