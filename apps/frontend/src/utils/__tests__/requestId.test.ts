import { describe, expect, it } from 'vitest'

import {
  REQUEST_ID_HEADER,
  isRequestId,
  newRequestId,
  requestIdFromHeaders,
} from '../requestId'

describe('requestId', () => {
  it('uses the header name the backend reads', () => {
    expect(REQUEST_ID_HEADER).toBe('X-Request-ID')
  })

  it('newRequestId makes 12 hex characters', () => {
    const id = newRequestId()
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(newRequestId()).not.toBe(id)
  })

  it('isRequestId accepts what the backend accepts', () => {
    expect(isRequestId('5f3a9c1e0b2d')).toBe(true)
    expect(isRequestId('abc-DEF_123')).toBe(true)
    expect(isRequestId('a'.repeat(64))).toBe(true)
  })

  it('isRequestId rejects what the backend rejects', () => {
    expect(isRequestId('')).toBe(false)
    expect(isRequestId('a'.repeat(65))).toBe(false)
    expect(isRequestId('has space')).toBe(false)
    expect(isRequestId('new\nline')).toBe(false)
    expect(isRequestId(undefined)).toBe(false)
    expect(isRequestId(42)).toBe(false)
  })

  it('requestIdFromHeaders keeps a valid caller id', () => {
    expect(requestIdFromHeaders({ 'x-request-id': '5f3a9c1e0b2d' })).toBe(
      '5f3a9c1e0b2d',
    )
  })

  it('requestIdFromHeaders takes the first value of a repeated header', () => {
    expect(
      requestIdFromHeaders({ 'x-request-id': ['first-id', 'second-id'] }),
    ).toBe('first-id')
  })

  it('requestIdFromHeaders makes a new id when the header is missing or bad', () => {
    expect(requestIdFromHeaders({})).toMatch(/^[0-9a-f]{12}$/)
    expect(requestIdFromHeaders({ 'x-request-id': 'bad id!' })).toMatch(
      /^[0-9a-f]{12}$/,
    )
  })
})
