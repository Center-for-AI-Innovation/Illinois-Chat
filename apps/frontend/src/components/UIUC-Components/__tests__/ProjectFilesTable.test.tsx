import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import { server } from '~/test-utils/server'
import { renderWithProviders } from '~/test-utils/renderWithProviders'

vi.mock('~/utils/toastUtils', () => ({
  showToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  showWarningToast: vi.fn(),
  showInfoToast: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    delete: vi.fn(async () => ({})),
    post: vi.fn(async () => ({ data: {} })),
    get: vi.fn(async () => ({ data: {} })),
  },
}))

vi.mock('@/hooks/queries/useFetchDocumentGroups', () => ({
  useFetchDocumentGroups: () => ({
    data: [
      { id: 1, name: 'Group A', doc_count: 1, enabled: true },
      { id: 2, name: 'Group B', doc_count: 0, enabled: true },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

const appendToDocGroupMutate = vi.fn(async () => undefined)
vi.mock('@/hooks/queries/useAppendToDocGroup', () => ({
  useAppendToDocGroup: () => ({
    mutate: appendToDocGroupMutate,
    isPending: false,
  }),
}))

const removeFromDocGroupMutate = vi.fn(async () => undefined)
vi.mock('@/hooks/queries/useDeleteFromDocGroup', () => ({
  useDeleteFromDocGroup: () => ({
    mutate: removeFromDocGroupMutate,
    isPending: false,
  }),
}))

vi.mock('~/utils/apiUtils', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    fetchPresignedUrl: vi.fn(async () => 'http://localhost/presigned'),
  }
})

vi.mock('~/utils/handleExport', () => ({
  handleExport: vi.fn(async () => ({ message: 'export started' })),
}))

describe('ProjectFilesTable', () => {
  it('renders success tab, filters/sorts, assigns groups, views and deletes documents, and opens export modal', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    server.use(
      http.get(
        '*/api/materialsTable/fetchProjectMaterials*',
        async ({ request }) => {
          const url = new URL(request.url)
          const filterKey = url.searchParams.get('filter_key') ?? ''
          const filterValue = url.searchParams.get('filter_value') ?? ''
          const sortDir = url.searchParams.get('sort_direction') ?? 'desc'

          return HttpResponse.json({
            final_docs: [
              {
                id: 1,
                course_name: 'CS101',
                readable_filename: `file1-${filterKey}-${filterValue}-${sortDir}.txt`,
                url: '',
                s3_path: 'cs101/file1.txt',
                base_url: 'http://base',
                created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
                doc_groups: ['Group A'],
              },
            ],
            total_count: 1,
          })
        },
      ),
      http.get('*/api/materialsTable/fetchFailedDocuments*', async () => {
        return HttpResponse.json({
          final_docs: [],
          total_count: 0,
          recent_fail_count: 0,
        })
      }),
    )

    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard' }

    const { ProjectFilesTable } = await import('../ProjectFilesTable')

    const onTabChange = vi.fn()
    renderWithProviders(
      <ProjectFilesTable
        course_name="CS101"
        tabValue="success"
        onTabChange={onTabChange}
        setFailedCount={vi.fn()}
        failedCount={0}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    expect(await screen.findByText(/Success/i)).toBeInTheDocument()
    expect(await screen.findByText(/file1-/i)).toBeInTheDocument()

    // Row-level document group change path: open the in-cell combobox and
    // pick the other group.
    const rowGroupCombobox = screen.getByRole('combobox', {
      name: 'Assign document groups',
    })
    await user.click(rowGroupCombobox)
    await user.click(await screen.findByRole('option', { name: 'Group B' }))

    await waitFor(() => expect(appendToDocGroupMutate).toHaveBeenCalled())

    // Close the combobox popup: Base UI marks the rest of the page
    // `aria-hidden` while it is open, which hides the header from `getByRole`.
    await user.keyboard('{Escape}')

    // Filter (updates queryKey and triggers refetch). The input lives behind
    // the column's funnel-icon popover.
    await user.click(
      screen.getByRole('button', { name: 'Filter by File Name' }),
    )
    await user.type(await screen.findByLabelText('File Name'), 'hello')
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          /filter_key=readable_filename/.test(String(url)),
        ),
      ).toBe(true),
    )

    // Close the filter popover before going after the sort control, so its
    // overlay is not sitting on top of the header row.
    await user.keyboard('{Escape}')

    // Sort (updates queryKey and triggers refetch) — the sort button, not
    // the filter popover's trigger, which is named "Filter by File Name".
    await user.click(screen.getByRole('button', { name: /^File Name/ }))
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          /sort_direction=asc|sort_direction=desc/.test(String(url)),
        ),
      ).toBe(true),
    )

    // View action uses presigned URL and window.open.
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    await user.click(screen.getByRole('button', { name: /view document/i }))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())

    // Select the row, open the bulk multi-select, and assign a group.
    await user.click(screen.getByRole('checkbox', { name: /select document/i }))
    await user.click(
      screen.getByRole('button', { name: /Add Document to Groups/i }),
    )
    const bulkGroupCombobox = screen.getByRole('combobox', {
      name: 'Filter by document group',
    })
    await user.click(bulkGroupCombobox)
    await user.click(await screen.findByRole('option', { name: 'Group B' }))

    // Delete action opens modal.
    await user.click(screen.getByRole('button', { name: /Delete document/i }))
    expect(
      await screen.findByText(/Please confirm your action/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Delete$/ }))

    const axiosMod = await import('axios')
    await waitFor(() =>
      expect((axiosMod as any).default.delete).toHaveBeenCalled(),
    )

    // Export modal is wired and openable.
    await user.click(screen.getByRole('button', { name: /^Export$/ }))
    expect(
      await screen.findByText(/export all the documents and embeddings/i),
    ).toBeInTheDocument()
  }, 20_000)

  it('shows a toast when attempting to delete more than 100 selected records', async () => {
    const user = userEvent.setup()
    const { showToast } = await import('~/utils/toastUtils')
    ;(showToast as any).mockClear()

    const manyDocs = Array.from({ length: 101 }).map((_, i) => ({
      id: i + 1,
      readable_filename: `f${i + 1}.txt`,
      s3_path: `cs101/f${i + 1}.txt`,
      url: '',
      base_url: '',
      created_at: new Date().toISOString(),
      doc_groups: [],
    }))

    server.use(
      http.get('*/api/materialsTable/fetchProjectMaterials*', async () => {
        return HttpResponse.json({ final_docs: manyDocs, total_count: 101 })
      }),
      http.get('*/api/materialsTable/fetchFailedDocuments*', async () => {
        return HttpResponse.json({
          final_docs: [],
          total_count: 0,
          recent_fail_count: 0,
        })
      }),
    )

    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard' }

    const { ProjectFilesTable } = await import('../ProjectFilesTable')
    renderWithProviders(
      <ProjectFilesTable
        course_name="CS101"
        tabValue="success"
        onTabChange={vi.fn()}
        setFailedCount={vi.fn()}
        failedCount={0}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await screen.findByText('f1.txt')

    await user.click(
      screen.getByRole('checkbox', {
        name: /select all documents on this page/i,
      }),
    )

    const deleteButton = await screen.findByRole('button', {
      name: /Delete 101 selected records/i,
    })
    await user.click(deleteButton)

    expect(showToast as any).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Selection Limit Exceeded' }),
    )
  }, 20_000)

  it('renders failed tab and shows error details modal via "Read more"', async () => {
    const user = userEvent.setup()

    const scrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    )
    const clientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    )
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 100,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 1,
    })

    server.use(
      http.get('*/api/materialsTable/fetchProjectMaterials*', async () => {
        return HttpResponse.json({
          final_docs: [],
          total_count: 0,
        })
      }),
      http.get('*/api/materialsTable/fetchFailedDocuments*', async () => {
        return HttpResponse.json({
          final_docs: [
            {
              id: 10,
              course_name: 'CS101',
              readable_filename: 'bad.pdf',
              url: '',
              s3_path: 'cs101/bad.pdf',
              base_url: '',
              created_at: new Date('2024-01-01T00:00:00.000Z').toISOString(),
              error: 'This is a long error that should overflow in the UI.',
              doc_groups: [],
            },
          ],
          total_count: 1,
          recent_fail_count: 1,
        })
      }),
    )

    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard' }
    const { ProjectFilesTable } = await import('../ProjectFilesTable')
    renderWithProviders(
      <ProjectFilesTable
        course_name="CS101"
        tabValue="failed"
        onTabChange={vi.fn()}
        setFailedCount={vi.fn()}
        failedCount={1}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await user.click(await screen.findByText(/Read more/i))
    expect(await screen.findByText(/Error Details/i)).toBeInTheDocument()

    if (scrollHeight)
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeight)
    else delete (HTMLElement.prototype as any).scrollHeight
    if (clientHeight)
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight)
    else delete (HTMLElement.prototype as any).clientHeight
  }, 20_000)

  it('refreshes both queries when the refresh button is clicked', async () => {
    const user = userEvent.setup()

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const countCalls = (pattern: RegExp) =>
      fetchSpy.mock.calls.filter(([url]) => pattern.test(String(url))).length

    server.use(
      http.get('*/api/materialsTable/fetchProjectMaterials*', async () => {
        return HttpResponse.json({ final_docs: [], total_count: 0 })
      }),
      http.get('*/api/materialsTable/fetchFailedDocuments*', async () => {
        return HttpResponse.json({
          final_docs: [],
          total_count: 0,
          recent_fail_count: 0,
        })
      }),
    )

    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard' }
    const { ProjectFilesTable } = await import('../ProjectFilesTable')
    renderWithProviders(
      <ProjectFilesTable
        course_name="CS101"
        tabValue="success"
        onTabChange={vi.fn()}
        setFailedCount={vi.fn()}
        failedCount={0}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await screen.findByText(/Success/i)

    const materialsBefore = countCalls(/fetchProjectMaterials/)
    const failedBefore = countCalls(/fetchFailedDocuments/)
    await user.click(
      screen.getByRole('button', { name: /refresh documents table/i }),
    )
    await waitFor(() => {
      expect(countCalls(/fetchProjectMaterials/)).toBeGreaterThan(
        materialsBefore,
      )
      expect(countCalls(/fetchFailedDocuments/)).toBeGreaterThan(failedBefore)
    })
  }, 20_000)

  it('renders an error-state table when document fetch fails', async () => {
    const { showErrorToast } = await import('~/utils/toastUtils')

    server.use(
      http.get('*/api/materialsTable/fetchProjectMaterials*', async () => {
        return new HttpResponse(null, { status: 500 })
      }),
      http.get('*/api/materialsTable/fetchFailedDocuments*', async () => {
        return HttpResponse.json({
          final_docs: [],
          total_count: 0,
          recent_fail_count: 0,
        })
      }),
    )

    globalThis.__TEST_ROUTER__ = { asPath: '/CS101/dashboard' }
    const { ProjectFilesTable } = await import('../ProjectFilesTable')

    renderWithProviders(
      <ProjectFilesTable
        course_name="CS101"
        tabValue="success"
        onTabChange={vi.fn()}
        setFailedCount={vi.fn()}
        failedCount={0}
      />,
      { homeContext: { dispatch: vi.fn() } },
    )

    await waitFor(() =>
      expect(showErrorToast as any).toHaveBeenCalledWith(
        'Failed to fetch documents',
        'Error',
      ),
    )
    expect(
      await screen.findByText(
        /Ah! We hit a wall when fetching your documents/i,
      ),
    ).toBeInTheDocument()
  })
})
