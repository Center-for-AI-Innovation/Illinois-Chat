import {
  Bot,
  ChartColumnBig,
  House,
  MessageSquareCode,
  SquareTerminal,
  Wrench,
} from 'lucide-react'

import { AI_MODELS_SECTIONS } from '../ai-models/ai-models.sections'
import { type AdminPage } from './admin-pages.types'

// Single registry for the admin sidebar. Only pages that exist today are
// listed; a page gains sidebar sub-items by exporting a `sections` list and
// rendering its headings from it (see ai-models.sections.ts).
export const ADMIN_HOME_PAGE: AdminPage = {
  title: 'Dashboard',
  icon: House,
  path: 'dashboard',
}

export const ADMIN_SETTINGS_PAGES: AdminPage[] = [
  {
    title: 'AI Models (LLMs)',
    icon: Bot,
    path: 'ai-models',
    sections: AI_MODELS_SECTIONS,
  },
  { title: 'Prompting and Behavior', icon: MessageSquareCode, path: 'prompt' },
  { title: 'Tools', icon: Wrench, path: 'tools' },
  { title: 'Usage Analysis', icon: ChartColumnBig, path: 'analysis' },
  { title: 'API', icon: SquareTerminal, path: 'api' },
]
