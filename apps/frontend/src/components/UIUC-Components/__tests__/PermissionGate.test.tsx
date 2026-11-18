import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { renderWithProviders } from '~/test-utils/renderWithProviders'
import { PermissionGate, getPermissionGateError } from '../PermissionGate'

describe('getPermissionGateError', () => {
  it('maps 401, 403 and 404 to their own screens and keeps the request id', () => {
    expect(getPermissionGateError({ status: 401 })).toEqual({
      errorType: 401,
      requestId: undefined,
    })
    expect(getPermissionGateError({ status: 403 })?.errorType).toBe(403)
    expect(
      getPermissionGateError({ status: 404, requestId: 'rid-404' }),
    ).toEqual({ errorType: 404, requestId: 'rid-404' })
  })

  it('maps 500 and 503 to the unavailable screen', () => {
    expect(
      getPermissionGateError(
        Object.assign(new Error('down'), { status: 503, requestId: 'rid-1' }),
      ),
    ).toEqual({ errorType: 'unavailable', requestId: 'rid-1' })
    expect(getPermissionGateError({ status: 500 })).toEqual({
      errorType: 'unavailable',
      requestId: undefined,
    })
  })

  it('maps an error with no status (no response) to the unavailable screen', () => {
    expect(getPermissionGateError(new TypeError('Failed to fetch'))).toEqual({
      errorType: 'unavailable',
      requestId: undefined,
    })
    expect(getPermissionGateError(undefined)?.errorType).toBe('unavailable')
  })

  it('ignores a request id that is not a string', () => {
    expect(
      getPermissionGateError({ status: 502, requestId: null })?.requestId,
    ).toBeUndefined()
  })

  it('returns null for other 4xx statuses so the page keeps its behaviour', () => {
    expect(getPermissionGateError({ status: 400 })).toBeNull()
    expect(getPermissionGateError({ status: 429 })).toBeNull()
  })
})

describe('PermissionGate unavailable state', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([503, 500])('renders the unavailable screen on %s', (status) => {
    const gate = getPermissionGateError({ status })
    renderWithProviders(
      <PermissionGate course_name="CS101" errorType={gate?.errorType} />,
    )

    expect(
      screen.getByRole('heading', {
        name: /This chatbot cannot be loaded right now/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The project settings could not be loaded. Try again in a minute.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sign in/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Create New/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the request ref when one is present', () => {
    renderWithProviders(
      <PermissionGate
        course_name="CS101"
        errorType="unavailable"
        requestId="abc-123"
      />,
    )

    expect(
      screen.getByText(
        'The project settings could not be loaded. Try again in a minute. (ref: abc-123)',
      ),
    ).toBeInTheDocument()
  })

  it('hides the ref when there is no request id', () => {
    renderWithProviders(
      <PermissionGate course_name="CS101" errorType="unavailable" />,
    )

    expect(screen.queryByText(/ref:/)).not.toBeInTheDocument()
  })

  it('reloads the page when Try again is clicked', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    renderWithProviders(
      <PermissionGate course_name="CS101" errorType="unavailable" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps the 404 screen unchanged', () => {
    renderWithProviders(<PermissionGate course_name="CS101" errorType={404} />)

    expect(
      screen.getByRole('heading', { name: /Chatbot not found/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })
})
