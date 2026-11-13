import { describe, expect, it } from 'vitest'

import { ADMIN_SETTINGS_PAGES } from '../../admin-layout/admin-pages'
import { PROJECT_DATA_SECTIONS } from '../project-data.sections'

describe('Project Data registry', () => {
  it('lists the four sections in order', () => {
    expect(PROJECT_DATA_SECTIONS.map((s) => s.id)).toEqual([
      'document-upload',
      'integrations',
      'document-groups',
      'project-files',
    ])
  })

  it('is registered above AI Models and drives the sidebar sub-items', () => {
    const paths = ADMIN_SETTINGS_PAGES.map((p) => p.path)
    expect(paths.indexOf('project-data')).toBe(0)
    expect(paths.indexOf('project-data')).toBeLessThan(
      paths.indexOf('ai-models'),
    )
    const page = ADMIN_SETTINGS_PAGES.find((p) => p.path === 'project-data')
    expect(page?.title).toBe('Project Data')
    expect(page?.sections).toBe(PROJECT_DATA_SECTIONS)
  })
})
