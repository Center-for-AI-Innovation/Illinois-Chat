import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  showWarningToast: vi.fn(),
  showInfoToast: vi.fn(),
}))

vi.mock('~/utils/functionCalling/handleFunctionCalling', () => ({
  clearCachedSimTools: vi.fn(),
  storeDiscoveredSimTools: vi.fn(),
  useFetchAllWorkflows: vi.fn(() => ({
    data: [
      {
        id: 'wf-1',
        readableName: 'Summarize Paper',
        description: 'Summarizes an uploaded paper.',
        hasAuthoredDescription: true,
        inputParameters: { required: ['paper_url'] },
      },
      {
        id: 'wf-2',
        readableName: 'Undocumented Flow',
        description: 'No description provided',
        hasAuthoredDescription: false,
        inputParameters: { required: [] },
      },
    ],
    isSuccess: true,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { showToast } from '~/utils/toastUtils'
import { storeDiscoveredSimTools } from '~/utils/functionCalling/handleFunctionCalling'
import SimPage from '../SimPage'

function makeJson(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function authorize() {
  globalThis.__TEST_ROUTER__ = { asPath: '/CS101/tools', replace: vi.fn() }
  globalThis.__TEST_AUTH__ = {
    isLoading: false,
    isAuthenticated: true,
    user: { profile: { email: 'owner@example.com' } },
  }
}

const courseMetadata = {
  course_metadata: {
    is_private: false,
    course_owner: 'owner@example.com',
    course_admins: [],
    project_description: 'desc',
  },
}

describe('SimPage', () => {
  it('renders the config form and the discovered workflows table', async () => {
    authorize()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
      if (url.includes('getSimConfig'))
        return makeJson({
          has_api_key: true,
          sim_api_key_masked: 'sk-s****1234',
          sim_workspace_id: 'ws-42',
          tool_routing: { status: 'default', model: 'gpt-4o' },
        })
      return makeJson({})
    })

    renderWithProviders(<SimPage course_name="CS101" />)

    // The three config inputs are label-associated, which the shadcn
    // primitives require wiring by hand.
    expect(await screen.findByText('sk-s****1234')).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace ID')).toHaveValue('ws-42')
    expect(screen.getByLabelText('Base URL (optional)')).toBeInTheDocument()
    // The stored key's mask is plain text, not an input, with Remove beside it.
    expect(document.getElementById('sim-api-key')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Remove API key' }),
    ).toBeInTheDocument()

    // Routing badge + explanation for the reported status.
    expect(screen.getByText('Default router')).toBeInTheDocument()
    expect(
      screen.getByText(/routed through the Illinois-hosted model \(gpt-4o\)/i),
    ).toBeInTheDocument()

    // Workflows table, including the "no description" warning badge.
    const table = screen.getByRole('table', {
      name: 'Deployed Sim AI workflows',
    })
    expect(table).toBeInTheDocument()
    expect(screen.getByText('Summarize Paper')).toBeInTheDocument()
    expect(screen.getByText('paper_url')).toBeInTheDocument()
    expect(screen.getByText('No description in Sim')).toBeInTheDocument()
  })

  it('saves the config and shows a failed save under the Save button', async () => {
    const user = userEvent.setup()
    authorize()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: any) => {
        const url = String(input?.url ?? input)
        if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
        if (url.includes('getSimConfig')) return makeJson({})
        if (url.includes('upsertSimConfig'))
          return makeJson({ error: 'bad workspace' }, 400)
        return makeJson({})
      })

    renderWithProviders(<SimPage course_name="CS101" />)

    await user.type(await screen.findByLabelText('API Key'), 'sk-sim-abc')
    await user.type(screen.getByLabelText('Workspace ID'), 'ws-9')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes('upsertSimConfig'),
        ),
      ).toBe(true),
    )

    // A 4xx is not a `fetch` rejection, so the component has to check `ok`
    // itself or it would show the success toast on a failed save.
    expect(await screen.findByRole('alert')).toHaveTextContent('bad workspace')
    expect(showToast).not.toHaveBeenCalled()
  })

  it('shows a base URL error under that field and clears it on edit', async () => {
    const user = userEvent.setup()
    authorize()
    vi.mocked(showToast).mockClear()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
      if (url.includes('getSimConfig')) return makeJson({})
      if (url.includes('upsertSimConfig'))
        return makeJson(
          { error: 'Invalid Sim base URL', fields: ['sim_base_url'] },
          400,
        )
      return makeJson({})
    })

    renderWithProviders(<SimPage course_name="CS101" />)

    const baseUrl = await screen.findByLabelText('Base URL (optional)')
    await user.type(baseUrl, 'https://evil.example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid Sim base URL',
    )
    expect(baseUrl).toHaveAttribute('aria-invalid', 'true')
    expect(baseUrl).toHaveAccessibleDescription(/Invalid Sim base URL/)
    expect(screen.getByLabelText('API Key')).not.toHaveAttribute('aria-invalid')
    expect(showToast).not.toHaveBeenCalled()

    await user.type(baseUrl, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(baseUrl).not.toHaveAttribute('aria-invalid')
  })

  it('flags both the key and the workspace when Sim refuses the pair, and does not save', async () => {
    const user = userEvent.setup()
    authorize()
    vi.mocked(showToast).mockClear()
    vi.mocked(storeDiscoveredSimTools).mockClear()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
      if (url.includes('getSimConfig')) return makeJson({})
      if (url.includes('upsertSimConfig'))
        return makeJson(
          {
            error: "This API key can't access that workspace.",
            fields: ['sim_api_key', 'sim_workspace_id'],
          },
          400,
        )
      return makeJson({})
    })

    renderWithProviders(<SimPage course_name="CS101" />)

    const apiKey = await screen.findByLabelText('API Key')
    const workspace = screen.getByLabelText('Workspace ID')
    await user.type(apiKey, 'sk-sim-abc')
    await user.type(workspace, 'ws-9')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // One message, under the Save button, describing both inputs.
    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveAttribute('id', 'sim-form-error')
    expect(apiKey).toHaveAttribute('aria-invalid', 'true')
    expect(workspace).toHaveAttribute('aria-invalid', 'true')
    expect(apiKey).toHaveAccessibleDescription(/can't access that workspace/)

    // Nothing was saved: the typed key stays for correcting.
    expect(apiKey).toHaveValue('sk-sim-abc')
    expect(storeDiscoveredSimTools).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()

    // Editing either flagged input clears the error from both.
    await user.type(apiKey, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(workspace).not.toHaveAttribute('aria-invalid')
  })

  it('shows the discovered workflows and a Saved note after a good save', async () => {
    const user = userEvent.setup()
    authorize()
    vi.mocked(showToast).mockClear()
    vi.mocked(storeDiscoveredSimTools).mockClear()
    const workflows = [
      { id: 'wf-9', name: 'New Flow', description: '', inputFields: [] },
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input?.url ?? input)
      if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
      if (url.includes('getSimConfig')) return makeJson({})
      if (url.includes('upsertSimConfig'))
        return makeJson({ success: true, workflows, failed: [] })
      return makeJson({})
    })

    renderWithProviders(<SimPage course_name="CS101" />)

    await user.type(await screen.findByLabelText('API Key'), 'sk-sim-abc')
    await user.type(screen.getByLabelText('Workspace ID'), 'ws-9')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Confirmed under the Save button, like a failure, not in a toast.
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(showToast).not.toHaveBeenCalled()
    expect(storeDiscoveredSimTools).toHaveBeenCalledWith(
      expect.anything(),
      'CS101',
      workflows,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // An edit means the form no longer matches what was saved.
    await user.type(screen.getByLabelText('Workspace ID'), 'x')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // `removes`: click Remove first; `typed`: then type this key.
  it.each([
    [
      'keeps the stored key when left alone',
      'sk-s****1234',
      false,
      '',
      undefined,
    ],
    ['removes the stored key', 'sk-s****1234', true, '', null],
    [
      'replaces a removed key with a typed one',
      'sk-s****1234',
      true,
      'sk-sim-new',
      'sk-sim-new',
    ],
    // No mask loaded (unreadable key, or the config failed to load): an empty
    // field must not delete whatever is stored.
    [
      'keeps an unreadable stored key when the field is left empty',
      null,
      false,
      '',
      undefined,
    ],
  ])('%s', async (_name, masked, removes, typed, sentKey) => {
    const user = userEvent.setup()
    authorize()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: any) => {
        const url = String(input?.url ?? input)
        if (url.includes('getCourseMetadata')) return makeJson(courseMetadata)
        if (url.includes('getSimConfig'))
          return makeJson({
            has_api_key: true,
            sim_api_key_masked: masked,
            sim_workspace_id: 'ws-42',
          })
        if (url.includes('upsertSimConfig'))
          return makeJson({ success: true, workflows: [], failed: [] })
        return makeJson({})
      })

    renderWithProviders(<SimPage course_name="CS101" />)

    await waitFor(() =>
      expect(screen.getByLabelText('Workspace ID')).toHaveValue('ws-42'),
    )
    if (removes) {
      await user.click(screen.getByRole('button', { name: 'Remove API key' }))
      expect(screen.getByLabelText('API Key')).toHaveValue('')
    }
    if (typed) await user.type(screen.getByLabelText('API Key'), typed)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes('upsertSimConfig'),
        ),
      ).toBe(true),
    )
    const [, init] = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('upsertSimConfig'),
    )!
    const payload = JSON.parse(String((init as RequestInit).body))
    if (sentKey === undefined) {
      expect(payload).not.toHaveProperty('sim_api_key')
    } else {
      expect(payload.sim_api_key).toBe(sentKey)
    }
  })
})
