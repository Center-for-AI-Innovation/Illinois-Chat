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

    // The three config inputs are label-associated, which the Mantine
    // <TextInput label=...> gave for free and the conversion wires by hand.
    expect(await screen.findByLabelText('API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('Workspace ID')).toHaveValue('ws-42')
    expect(screen.getByLabelText('Base URL (optional)')).toBeInTheDocument()
    expect(screen.getByText('Stored key: sk-s****1234')).toBeInTheDocument()

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

  it('saves the config and reports a failed save through a toast', async () => {
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
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'bad workspace' }),
      ),
    )
  })
})
