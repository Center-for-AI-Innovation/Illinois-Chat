import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DocGroupMultiSelect } from '../DocGroupMultiSelect'

const DATA = [
  { value: 'Group A', label: 'Group A' },
  { value: 'Group B', label: 'Group B' },
]

describe('DocGroupMultiSelect', () => {
  it('renders the currently selected values as chips', () => {
    render(
      <DocGroupMultiSelect
        data={DATA}
        value={['Group A']}
        onChange={vi.fn()}
        aria-label="Assign document groups"
      />,
    )

    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.queryByText('Group B')).not.toBeInTheDocument()
  })

  it('filters options as the user types and selects a match', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DocGroupMultiSelect
        data={DATA}
        value={[]}
        onChange={onChange}
        aria-label="Assign document groups"
      />,
    )

    const input = screen.getByRole('combobox', {
      name: 'Assign document groups',
    })
    await user.click(input)
    await user.type(input, 'Group B')

    const option = await screen.findByRole('option', { name: 'Group B' })
    await user.click(option)

    expect(onChange).toHaveBeenCalledWith(['Group B'])
  })

  it('creates a new group when typing a name with no exact match', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DocGroupMultiSelect
        data={DATA}
        value={[]}
        onChange={onChange}
        aria-label="Assign document groups"
      />,
    )

    const input = screen.getByRole('combobox', {
      name: 'Assign document groups',
    })
    await user.click(input)
    await user.type(input, 'Brand New Group')

    const createOption = await screen.findByRole('option', {
      name: '+ Create "Brand New Group"',
    })
    await user.click(createOption)

    // The plain created string round-trips out, never the internal sentinel object.
    expect(onChange).toHaveBeenCalledWith(['Brand New Group'])
  })

  it('removes a selected chip via its remove button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DocGroupMultiSelect
        data={DATA}
        value={['Group A', 'Group B']}
        onChange={onChange}
        aria-label="Assign document groups"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Group A' }))

    expect(onChange).toHaveBeenCalledWith(['Group B'])
  })
})
