// The editor holds masked secrets, so what is on screen is not what should be
// written. These tests pin the write payload: only retyped fields go out, a
// masked value never does, and the toggle takes the dedicated activation route
// rather than a POST that would re-enable a disabled connection.

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectConnectionEditor } from '~/components/UIUC-Components/super-admin/ProjectConnectionEditor'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showWarningToast: vi.fn(),
  showInfoToast: vi.fn(),
}))

interface CapturedWrite {
  method: string
  url: string
  body: unknown
}

let writes: CapturedWrite[] = []

const STORED_QDRANT = {
  url: 'https://qdrant.example.edu',
  api_key: '****cdef',
  port: 6333,
  default_collection: 'illinois',
  apply_course_filter: true,
  parallel: false,
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    found: true,
    project_name: 'alpha',
    is_active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    s3_config: null,
    database_config: null,
    qdrant_config: STORED_QDRANT,
    embedding_config: null,
    ...overrides,
  }
}

function useDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get('*/api/UIUC-api/projectConnections', () =>
      HttpResponse.json(detail(overrides)),
    ),
  )
}

beforeEach(() => {
  writes = []
  server.use(
    http.patch('*/api/UIUC-api/projectConnections', async ({ request }) => {
      writes.push({
        method: 'PATCH',
        url: '/projectConnections',
        body: await request.json(),
      })
      return HttpResponse.json({ success: true })
    }),
    http.post('*/api/UIUC-api/projectConnections', async ({ request }) => {
      writes.push({
        method: 'POST',
        url: '/projectConnections',
        body: await request.json(),
      })
      return HttpResponse.json({ success: true })
    }),
    http.patch(
      '*/api/UIUC-api/projectConnections/active',
      async ({ request }) => {
        writes.push({
          method: 'PATCH',
          url: '/projectConnections/active',
          body: await request.json(),
        })
        return HttpResponse.json({ success: true })
      },
    ),
    http.delete('*/api/UIUC-api/projectConnections', async ({ request }) => {
      writes.push({
        method: 'DELETE',
        url: new URL(request.url).search,
        body: null,
      })
      return HttpResponse.json({ success: true })
    }),
  )
})

function renderEditor() {
  return renderWithProviders(
    <ProjectConnectionEditor
      projectName="alpha"
      open={true}
      onOpenChange={vi.fn()}
    />,
  )
}

describe('ProjectConnectionEditor', () => {
  it('masks the stored secret and hides its input until Change is pressed', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    expect(await screen.findByText('****cdef')).toBeInTheDocument()
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Change / }))

    const input = screen.getByLabelText(/API key/)
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('')
    expect(
      screen.getByText(/Leave blank to keep the current value/),
    ).toBeInTheDocument()
  })

  it('sends only the changed field, never the masked secret', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    const collection = await screen.findByLabelText(/Default collection/)
    await user.clear(collection)
    await user.type(collection, 'illinois-v2')

    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      body: {
        project_name: 'alpha',
        kind: 'qdrant',
        config: { default_collection: 'illinois-v2' },
      },
    })
    // Everything the operator did not retype is absent, so the server merges
    // the real stored values instead of receiving '****cdef' as a credential.
    expect(Object.keys((writes[0]!.body as any).config)).toEqual([
      'default_collection',
    ])
  })

  it('omits a secret whose edit input was left blank', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    const collection = await screen.findByLabelText(/Default collection/)
    await user.clear(collection)
    await user.type(collection, 'illinois-v2')

    await user.click(screen.getByRole('button', { name: /^Change / }))
    // Opened but left empty: that means "keep the stored secret", not "set it
    // to empty string".
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect((writes[0]!.body as any).config).not.toHaveProperty('api_key')
  })

  it('sends a retyped secret', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    await screen.findByText('****cdef')
    await user.click(screen.getByRole('button', { name: /^Change / }))
    await user.type(screen.getByLabelText(/API key/), 'brand-new-key')
    await user.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect((writes[0]!.body as any).config).toEqual({
      api_key: 'brand-new-key',
    })
  })

  it('keeps Save disabled until something actually changes', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    const save = await screen.findByRole('button', { name: /Save changes/ })
    expect(save).toBeDisabled()

    const collection = screen.getByLabelText(/Default collection/)
    await user.clear(collection)
    await user.type(collection, 'illinois-v2')
    expect(save).toBeEnabled()
  })

  it('routes the activation toggle away from the upserting POST', async () => {
    const user = userEvent.setup()
    useDetail({ is_active: false })
    renderEditor()

    const toggle = await screen.findByRole('switch', {
      name: /Use these connection overrides/,
    })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    await waitFor(() => expect(writes).toHaveLength(1))
    // POST hardcodes is_active: true, so a toggle must never go through it.
    expect(writes[0]).toEqual({
      method: 'PATCH',
      url: '/projectConnections/active',
      body: { project_name: 'alpha', is_active: true },
    })
  })

  it('validates a first-time config client-side before sending anything', async () => {
    const user = userEvent.setup()
    useDetail({ qdrant_config: null })
    renderEditor()

    await screen.findByText(/No qdrant vector store is configured/i)
    await user.click(
      screen.getByRole('button', { name: /Create configuration/ }),
    )

    // No stored config to merge onto, so an incomplete config must be caught
    // here rather than turning into a 400.
    await waitFor(() =>
      expect(screen.getByLabelText(/^URL/)).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    )
    expect(writes).toHaveLength(0)
  })

  it('upserts a complete first-time config', async () => {
    const user = userEvent.setup()
    useDetail({ qdrant_config: null })
    renderEditor()

    await user.type(
      await screen.findByLabelText(/^URL/),
      'https://qdrant.example.edu',
    )
    await user.type(screen.getByLabelText(/API key/), 'secret-key')
    await user.type(screen.getByLabelText(/^Port/), '6333')
    await user.type(screen.getByLabelText(/Default collection/), 'illinois')

    await user.click(
      screen.getByRole('button', { name: /Create configuration/ }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.method).toBe('POST')
    expect((writes[0]!.body as any).config).toMatchObject({
      url: 'https://qdrant.example.edu',
      api_key: 'secret-key',
      port: 6333,
      default_collection: 'illinois',
    })
  })

  it('confirms before removing a configuration', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    await user.click(await screen.findByRole('button', { name: /Remove/ }))

    expect(
      await screen.findByText(/Remove the Qdrant vector store config\?/),
    ).toBeInTheDocument()
    expect(writes).toHaveLength(0)

    await user.click(
      screen.getByRole('button', { name: /Remove configuration/ }),
    )

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]!.method).toBe('DELETE')
    expect(writes[0]!.url).toContain('kind=qdrant')
  })

  it('warns before discarding a typed secret on close', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    useDetail()

    renderWithProviders(
      <ProjectConnectionEditor
        projectName="alpha"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    await screen.findByText('****cdef')
    await user.click(screen.getByRole('button', { name: /^Change / }))
    await user.type(screen.getByLabelText(/API key/), 'half-typed')

    await user.keyboard('{Escape}')

    // A typed secret cannot be recovered from anywhere, so an accidental Esc
    // has to be confirmed.
    expect(
      await screen.findByText(/Discard unsaved changes\?/),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('blocks Test saved connection while there are unsaved edits', async () => {
    const user = userEvent.setup()
    useDetail()
    renderEditor()

    const test = await screen.findByRole('button', {
      name: /Test saved connection/,
    })
    expect(test).toBeEnabled()

    const collection = screen.getByLabelText(/Default collection/)
    await user.clear(collection)
    await user.type(collection, 'illinois-v2')

    // The probe reads the stored config, so offering it against unsaved values
    // would report on something other than what is on screen.
    expect(test).toBeDisabled()
  })
})
