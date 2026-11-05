// This schema is the single validator for both the /admin form and the API
// handler, so anything it lets through is written to Redis and rendered into
// an href on the home page.

import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
  announcementBannerSchema,
  addSuperAdminBodySchema,
  hasBannerLink,
  maintenanceSettingsSchema,
  platformSettingsSchema,
  storedAnnouncementBannerSchema,
  superAdminEmailSchema,
} from '~/utils/platformSettings.schema'

const VALID = {
  enabled: true,
  message: 'Downtime Saturday.',
  linkText: 'Status',
  linkUrl: 'https://status.illinois.edu',
}

function issuePaths(result: { success: boolean; error?: any }) {
  return (result.error?.issues ?? []).map((issue: any) =>
    issue.path.join('.'),
  )
}

describe('announcementBannerSchema link URL', () => {
  it('accepts an https URL', () => {
    expect(announcementBannerSchema.safeParse(VALID).success).toBe(true)
  })

  it('accepts a blank URL alongside blank text', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      linkText: '',
      linkUrl: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects javascript:', () => {
    // `new URL()` parses this happily, which is exactly why the scheme is
    // allow-listed rather than merely checked for parseability.
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      linkUrl: 'javascript:alert(1)',
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('linkUrl')
  })

  it('rejects http:', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      linkUrl: 'http://status.illinois.edu',
    })
    expect(result.success).toBe(false)
  })

  it('rejects data: and other exotic schemes', () => {
    for (const url of [
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(
        announcementBannerSchema.safeParse({ ...VALID, linkUrl: url }).success,
      ).toBe(false)
    }
  })

  it('rejects a relative URL', () => {
    expect(
      announcementBannerSchema.safeParse({ ...VALID, linkUrl: '/status' })
        .success,
    ).toBe(false)
  })
})

describe('announcementBannerSchema coherence', () => {
  it('requires a message when enabled', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      message: '',
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('message')
  })

  it('allows a blank message when disabled', () => {
    const result = announcementBannerSchema.safeParse({
      enabled: false,
      message: '',
      linkText: '',
      linkUrl: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects link text without a URL', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      linkUrl: '',
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('linkUrl')
  })

  it('rejects a URL without link text', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      linkText: '',
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('linkText')
  })

  it('rejects an over-long message', () => {
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      message: 'x'.repeat(ANNOUNCEMENT_MESSAGE_MAX_LENGTH + 1),
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('message')
  })

  it('trims before applying the coherence rules', () => {
    // '   ' must count as no message, not as a three-character one.
    const result = announcementBannerSchema.safeParse({
      ...VALID,
      message: '   ',
    })
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('message')
  })
})

describe('storedAnnouncementBannerSchema', () => {
  it('parses a record without audit fields', () => {
    // Records written by an earlier version, or by hand with redis-cli, must
    // not be treated as invalid.
    expect(storedAnnouncementBannerSchema.safeParse(VALID).success).toBe(true)
  })

  it('keeps the audit fields when present', () => {
    const result = storedAnnouncementBannerSchema.safeParse({
      ...VALID,
      updatedAt: '2026-09-08T00:00:00.000Z',
      updatedBy: 'admin@example.com',
    })
    expect(result.success && result.data.updatedBy).toBe('admin@example.com')
  })

  it('applies the coherence rules on read too', () => {
    expect(
      storedAnnouncementBannerSchema.safeParse({ ...VALID, linkText: '' })
        .success,
    ).toBe(false)
  })
})

describe('maintenanceSettingsSchema', () => {
  it('accepts blank copy', () => {
    expect(
      maintenanceSettingsSchema.safeParse({
        enabled: true,
        titleText: '',
        bodyText: '',
      }).success,
    ).toBe(true)
  })

  it('rejects an over-long body', () => {
    expect(
      maintenanceSettingsSchema.safeParse({
        enabled: true,
        titleText: '',
        bodyText: 'x'.repeat(1001),
      }).success,
    ).toBe(false)
  })
})

describe('platformSettingsSchema', () => {
  it('reports the failing half by path', () => {
    const result = platformSettingsSchema.safeParse({
      announcementBanner: { ...VALID, linkUrl: 'http://x.example' },
      maintenance: { enabled: false, titleText: '', bodyText: '' },
    })
    expect(issuePaths(result)).toContain('announcementBanner.linkUrl')
  })
})

describe('superAdminEmailSchema', () => {
  it('normalizes case and whitespace', () => {
    const result = superAdminEmailSchema.safeParse('  Admin@Example.COM ')
    expect(result.success && result.data).toBe('admin@example.com')
  })

  it('rejects a malformed address', () => {
    for (const value of ['', 'not-an-email', 'a@b', '@example.com']) {
      expect(superAdminEmailSchema.safeParse(value).success).toBe(false)
    }
  })

  it('is reused by the request body schema', () => {
    const result = addSuperAdminBodySchema.safeParse({
      email: 'Admin@Example.com',
    })
    expect(result.success && result.data.email).toBe('admin@example.com')
  })
})

describe('hasBannerLink', () => {
  it('requires both halves', () => {
    expect(hasBannerLink({ linkText: 'Status', linkUrl: 'https://x.test' })).toBe(
      true,
    )
    expect(hasBannerLink({ linkText: '', linkUrl: 'https://x.test' })).toBe(
      false,
    )
    expect(hasBannerLink({ linkText: 'Status', linkUrl: '' })).toBe(false)
  })
})
