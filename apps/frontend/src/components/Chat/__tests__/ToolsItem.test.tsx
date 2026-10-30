import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { ToolsItem } from '../ToolsItem'
import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { readDisabledToolIds, setToolDisabled } from '~/utils/app/disabledTools'

describe('ToolsItem', () => {
  it('filters tools by search and toggles via HomeContext dispatch', () => {
    const dispatch = vi.fn()

    const tools = [
      { id: 't1', readableName: 'Tool One', enabled: true },
      { id: 't2', readableName: 'Another Tool', enabled: false },
    ]

    renderWithProviders(<ToolsItem />, {
      homeState: { tools } as any,
      homeContext: { dispatch } as any,
    })

    expect(screen.getByText('Tool One')).toBeInTheDocument()
    expect(screen.getByText('Another Tool')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search Tools'), {
      target: { value: 'another' },
    })

    expect(screen.queryByText('Tool One')).toBeNull()
    expect(screen.getByText('Another Tool')).toBeInTheDocument()

    const row = screen.getByText('Another Tool').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('switch'))

    expect(dispatch).toHaveBeenCalledWith({
      field: 'tools',
      value: expect.arrayContaining([
        expect.objectContaining({
          id: 't2',
          enabled: true,
        }),
      ]),
    })
  })

  it('saves each switch under the selected conversation', () => {
    localStorage.clear()
    setToolDisabled('conv-1', 't2', true)
    const tools = [
      { id: 't1', readableName: 'Tool One', enabled: true },
      { id: 't2', readableName: 'Tool Two', enabled: false },
    ]
    renderWithProviders(<ToolsItem />, {
      homeState: { tools, selectedConversation: { id: 'conv-1' } } as any,
      homeContext: { dispatch: vi.fn() } as any,
    })

    const switchFor = (name: string) =>
      within(screen.getByText(name).closest('tr') as HTMLElement).getByRole(
        'switch',
      )
    fireEvent.click(switchFor('Tool One'))
    expect(readDisabledToolIds('conv-1')).toEqual(['t2', 't1'])
    fireEvent.click(switchFor('Tool Two'))
    expect(readDisabledToolIds('conv-1')).toEqual(['t1'])
    expect(readDisabledToolIds('conv-2')).toEqual([])
    localStorage.clear()
  })

  it('shows an empty state when tools list is empty', () => {
    renderWithProviders(<ToolsItem />, { homeState: { tools: [] } as any })
    expect(screen.getByText('No tools found')).toBeInTheDocument()
  })
})
