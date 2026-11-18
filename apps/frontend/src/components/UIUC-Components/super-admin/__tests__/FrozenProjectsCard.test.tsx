import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { server } from '~/test-utils/server'
import { FrozenProjectsCard } from '../FrozenProjectsCard'

const PROJECTS = [
  { course_name: 'Alpha', course_owner: 'alice@example.com', is_private: true },
  { course_name: 'Beta', course_owner: null, is_private: false },
]

beforeEach(() => {
  server.resetHandlers()
})

describe('FrozenProjectsCard', () => {
  it('lists frozen projects with their owner and visibility', async () => {
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: PROJECTS }),
      ),
    )
    renderWithProviders(<FrozenProjectsCard />)

    const row = (await screen.findByText('Alpha')).closest('tr')!
    expect(within(row).getByText('alice@example.com')).toBeTruthy()
    expect(within(row).getByText('Private')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.getByText('2 frozen projects.')).toBeTruthy()
  })

  it('shows an empty state when nothing is frozen', async () => {
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: [] }),
      ),
    )
    renderWithProviders(<FrozenProjectsCard />)

    expect(await screen.findByText('No frozen projects')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Recover / })).toBeNull()
  })

  it('shows the load error and retries on request', async () => {
    // The hook retries once, so the first load and its retry both fail.
    let calls = 0
    server.use(
      http.get('*/api/admin/frozenProjects', () => {
        calls += 1
        if (calls <= 2) {
          return HttpResponse.json(
            { error: 'settings store unreachable' },
            { status: 500 },
          )
        }
        return HttpResponse.json({ projects: PROJECTS })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    // The hook retries once before showing the error, so allow for that delay.
    expect(
      await screen.findByText('Could not load frozen projects', undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy()
    expect(screen.getByText('settings store unreachable')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Alpha')).toBeTruthy()
  })

  it('does not recover anything until the operator confirms', async () => {
    const posted: unknown[] = []
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: PROJECTS }),
      ),
      http.post('*/api/admin/frozenProjects', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ recovered: true, course_name: 'Alpha' })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    await user.click(
      await screen.findByRole('button', { name: 'Recover Alpha' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Recover “Alpha”?')).toBeTruthy()
    expect(posted).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(posted).toEqual([])
  })

  it('sends the exact project name once confirmed and reports the result', async () => {
    const posted: unknown[] = []
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: PROJECTS }),
      ),
      http.post('*/api/admin/frozenProjects', async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ recovered: true, course_name: 'Alpha' })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    await user.click(
      await screen.findByRole('button', { name: 'Recover Alpha' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Recover project' }),
    )

    // Base UI hides the page from assistive tech while the dialog is open, so
    // the status line is only reachable by role once the dialog has closed.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recovered “Alpha”',
    )
    expect(posted).toEqual([{ course_name: 'Alpha' }])
  })

  it('shows an unfrozen project with an unfinished audit as a warning, and drops it from the list', async () => {
    let frozen = [...PROJECTS]
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: frozen }),
      ),
      http.post('*/api/admin/frozenProjects', () => {
        // The unfreeze landed, so the next list no longer includes Alpha.
        frozen = frozen.filter((project) => project.course_name !== 'Alpha')
        return HttpResponse.json(
          {
            recovered: true,
            error:
              'The project was unfrozen, but its audit entry could not be finalized. Check the audit log before retrying.',
          },
          { status: 500 },
        )
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    await user.click(
      await screen.findByRole('button', { name: 'Recover Alpha' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Recover project' }),
    )

    expect(
      await screen.findByText('Project recovered; audit needs attention'),
    ).toBeTruthy()
    expect(
      screen.getByText(/The project was unfrozen, but its audit entry/),
    ).toBeTruthy()
    expect(screen.queryByText('Could not recover the project')).toBeNull()
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull())
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('keeps an ordinary 500 red and leaves the project listed', async () => {
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: PROJECTS }),
      ),
      http.post('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ error: 'Internal server error' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    await user.click(
      await screen.findByRole('button', { name: 'Recover Alpha' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Recover project' }),
    )

    expect(
      await screen.findByText('Could not recover the project'),
    ).toBeTruthy()
    expect(screen.getByText('Internal server error')).toBeTruthy()
    expect(
      screen.queryByText('Project recovered; audit needs attention'),
    ).toBeNull()
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('surfaces the server refusal and keeps the list usable', async () => {
    server.use(
      http.get('*/api/admin/frozenProjects', () =>
        HttpResponse.json({ projects: PROJECTS }),
      ),
      http.post('*/api/admin/frozenProjects', () =>
        HttpResponse.json(
          { error: "Project 'Alpha' is not frozen." },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<FrozenProjectsCard />)

    await user.click(
      await screen.findByRole('button', { name: 'Recover Alpha' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Recover project' }),
    )

    expect(
      await screen.findByText('Could not recover the project'),
    ).toBeTruthy()
    expect(screen.getByText("Project 'Alpha' is not frozen.")).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })
})
