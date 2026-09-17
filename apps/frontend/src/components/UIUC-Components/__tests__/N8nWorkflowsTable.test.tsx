import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
}))

const PAGE_SIZE = 25

// One extra record beyond a single page so pagination is actually exercised.
const records = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
  id: `w${i + 1}`,
  name: i === 0 ? 'Workflow A' : `Workflow ${i + 1}`,
  active: i === 0,
  tags: i === 0 ? [{ name: 't1' }, { name: 't2' }] : [],
  createdAt: new Date(2024, 0, PAGE_SIZE + 1 - i).toISOString(),
  updatedAt: new Date(2024, 0, PAGE_SIZE + 2 - i).toISOString(),
}))

vi.mock('~/utils/functionCalling/handleFunctionCalling', () => ({
  useFetchAllWorkflows: () => ({
    data: records,
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  }),
}))

const mutateSpy = vi.fn()
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original = await importOriginal<any>()
  return {
    ...original,
    useMutation: (options: any) => ({
      mutate: (variables: any) => {
        mutateSpy(variables)
        // Drive error + settled callbacks for coverage.
        const ctx = options?.onMutate?.(variables)
        options?.onError?.(new Error('boom'), variables, ctx)
        options?.onSettled?.(undefined, new Error('boom'), variables, ctx)
      },
    }),
  }
})

import { showToast } from '~/utils/toastUtils'

import { N8nWorkflowsTable } from '../N8nWorkflowsTable'

describe('N8nWorkflowsTable', () => {
  it('renders records and toggles workflow activation', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <N8nWorkflowsTable
        n8nApiKey="key"
        course_name="CS101"
        isEmptyWorkflowTable={false}
        sidebarCollapsed
      />,
    )

    expect(
      await screen.findByText(/These tools can be automatically invoked/i),
    ).toBeInTheDocument()

    // Sorted by createdAt desc, so "Workflow A" (the most recent) is on page 1.
    expect(screen.getByText('Workflow A')).toBeInTheDocument()
    expect(screen.getByText('t1, t2')).toBeInTheDocument()

    // Toggle switch triggers mutate with id + checked
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!)
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1', checked: false }),
    )

    // The mocked useMutation drives onError, which surfaces an error toast
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error with activation',
        message: 'boom',
        type: 'error',
        autoClose: 12000,
      }),
    )

    // Pagination is wired to the real footer: with PAGE_SIZE + 1 records
    // there are 2 pages, and page 2 holds exactly the oldest record.
    expect(screen.getByText(`1–${PAGE_SIZE} of ${records.length}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next page/i }))
    expect(
      screen.getByText(`${PAGE_SIZE + 1}–${records.length} of ${records.length}`),
    ).toBeInTheDocument()
    expect(screen.getByText(`Workflow ${PAGE_SIZE + 1}`)).toBeInTheDocument()
  })

  it('shows a loading state while fetching', async () => {
    vi.resetModules()
    vi.doMock('~/utils/functionCalling/handleFunctionCalling', () => ({
      useFetchAllWorkflows: () => ({
        data: undefined,
        isLoading: true,
        isSuccess: false,
        isError: false,
        refetch: vi.fn(),
      }),
    }))
    const { N8nWorkflowsTable: LoadingTable } = await import(
      '../N8nWorkflowsTable'
    )

    renderWithProviders(
      <LoadingTable
        n8nApiKey="key"
        course_name="CS101"
        isEmptyWorkflowTable={false}
      />,
    )

    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
