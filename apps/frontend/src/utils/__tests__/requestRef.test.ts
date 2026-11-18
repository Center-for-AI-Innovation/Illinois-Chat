import { describe, expect, it } from 'vitest'

import {
  axiosErrorText,
  fetchErrorText,
  withRequestRef,
} from '~/utils/requestRef'

function jsonResponse(body: unknown, status: number, rid?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (rid) headers['x-request-id'] = rid
  return new Response(JSON.stringify(body), { status, headers })
}

describe('withRequestRef', () => {
  it('appends the ref when an id is present', () => {
    expect(withRequestRef('Upload failed', 'abc123')).toBe(
      'Upload failed (ref: abc123)',
    )
  })

  it('leaves the message alone when the id is missing or blank', () => {
    expect(withRequestRef('Upload failed')).toBe('Upload failed')
    expect(withRequestRef('Upload failed', null)).toBe('Upload failed')
    expect(withRequestRef('Upload failed', '  ')).toBe('Upload failed')
  })
})

describe('fetchErrorText', () => {
  it('uses the error field of a JSON body and the response header id', async () => {
    const response = jsonResponse(
      { error: 'Canvas rejected the configured access token' },
      502,
      'rid42',
    )
    await expect(fetchErrorText(response, 'fallback')).resolves.toBe(
      'Canvas rejected the configured access token (ref: rid42)',
    )
  })

  it('falls back when the body has no usable error field', async () => {
    const response = jsonResponse({ error: '  ' }, 500)
    await expect(fetchErrorText(response, 'Ingest failed')).resolves.toBe(
      'Ingest failed',
    )
  })

  it('falls back when the body is not JSON', async () => {
    const response = new Response('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'x-request-id': 'rid7' },
    })
    await expect(fetchErrorText(response, 'Ingest failed')).resolves.toBe(
      'Ingest failed (ref: rid7)',
    )
  })
})

describe('axiosErrorText', () => {
  it('prefers the server message and adds the ref', () => {
    expect(
      axiosErrorText({
        message: 'Request failed with status code 500',
        response: {
          data: { message: 'getaddrinfo ENOTFOUND crawlee' },
          headers: { 'x-request-id': 'rid9' },
        },
      }),
    ).toBe('getaddrinfo ENOTFOUND crawlee (ref: rid9)')
  })

  it('falls back to the axios message without a ref when there is no response', () => {
    expect(axiosErrorText({ message: 'Network Error' })).toBe('Network Error')
  })

  it('ignores a non-string message and header', () => {
    expect(
      axiosErrorText({
        response: { data: { message: 42 }, headers: { 'x-request-id': 1 } },
      }),
    ).toBe('')
  })
})
