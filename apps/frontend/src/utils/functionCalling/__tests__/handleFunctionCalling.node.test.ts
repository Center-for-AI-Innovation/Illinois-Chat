/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'

vi.mock('~/pages/api/UIUC-api/runN8nFlow', () => ({
  runN8nFlowBackend: vi.fn(),
}))

const hoisted = vi.hoisted(() => ({
  getN8nWorkflows: vi.fn(),
}))

vi.mock('~/utils/n8nClient', () => ({
  getN8nWorkflows: hoisted.getN8nWorkflows,
}))

describe('handleFunctionCalling (node)', () => {
  it('fetchTools returns [] when no api_key exists for project (404)', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 404 }),
    )

    await expect(
      fetchTools('proj', 'undefined', 10, 'true', false, 'http://localhost'),
    ).resolves.toEqual([])
  })

  it('fetchTools returns [] when fetching the project api_key fails', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    )

    await expect(
      fetchTools('proj', 'undefined', 10, 'true', false, 'http://localhost'),
    ).resolves.toEqual([])
  })

  it('fetchTools returns [] when the fetched api_key is still undefined', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('undefined'), { status: 200 }),
    )

    await expect(
      fetchTools('proj', 'undefined', 10, 'true', false, 'http://localhost'),
    ).resolves.toEqual([])
  })

  it('fetchTools maps a flat n8n workflow list on the server', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')
    hoisted.getN8nWorkflows.mockResolvedValueOnce([
      {
        id: 'w1',
        name: 'My Workflow',
        active: true,
        updatedAt: 'u',
        createdAt: 'c',
        nodes: [
          {
            type: 'n8n-nodes-base.formTrigger',
            parameters: {
              formDescription: 'd',
              formFields: { values: [] },
            },
          },
        ],
      },
    ])
    await expect(fetchTools('proj', 'k', 10, 'false', false)).resolves.toHaveLength(
      1,
    )
  })

  it('fetchTools throws when n8n lookup fails on the server', async () => {
    hoisted.getN8nWorkflows.mockRejectedValueOnce(new Error('n8n down'))
    const { fetchTools } = await import('../handleFunctionCalling')
    await expect(fetchTools('proj', 'k', 10, 'true', false)).rejects.toThrow(
      /n8n down/i,
    )
  })

  it('fetchTools calls n8n directly on the server', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')

    hoisted.getN8nWorkflows.mockResolvedValueOnce([
      [
        {
          id: 'w1',
          name: 'My Workflow',
          active: true,
          updatedAt: 'u',
          createdAt: 'c',
          nodes: [
            {
              type: 'n8n-nodes-base.formTrigger',
              parameters: {
                formDescription: 'd',
                formFields: { values: [] },
              },
            },
          ],
        },
      ],
    ])

    const tools = await fetchTools('proj', 'k', 10, 'true', false)
    expect(tools).toHaveLength(1)
    expect(hoisted.getN8nWorkflows).toHaveBeenCalledWith({
      apiKey: 'k',
      limit: 10,
      pagination: true,
    })
  })

  it('fetchTools returns the raw first page when full_details is true', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')
    const workflow = { id: 'w1', name: 'Mine', active: true, nodes: [] }
    hoisted.getN8nWorkflows.mockResolvedValueOnce(workflow)
    await expect(fetchTools('proj', 'k', 10, 'false', true)).resolves.toEqual([
      workflow,
    ])
  })

  it('fetchTools throws when n8n responds with an error', async () => {
    const { fetchTools } = await import('../handleFunctionCalling')
    hoisted.getN8nWorkflows.mockRejectedValueOnce(
      new Error('Unable to fetch n8n tools: Server Error'),
    )

    await expect(fetchTools('proj', 'k', 10, 'true', false)).rejects.toThrow(
      /Unable to fetch n8n tools/i,
    )
  })

  it('handleToolCall populates tool output via runN8nFlowBackend on the server', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )

    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                data: {
                  main: [[{ json: { response: 'hello' } }]],
                },
              },
            ],
          },
        },
      },
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toEqual({ text: 'hello' })
  })

  it('handleToolCall sets error when server-side n8n api_key resolves to empty string', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(''), { status: 200 }),
    )

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(
      /N8N API key is required/i,
    )
  })

  it('handleToolCall sets timeout error when runN8nFlowBackend throws timed out', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockRejectedValueOnce(new Error('timed out'))

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(
      /Request timed out/i,
    )
  })

  it('handleToolCall preserves non-timeout errors from runN8nFlowBackend', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockRejectedValueOnce(new Error('boom'))

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(/boom/i)
  })

  it('handleToolCall sets empty response error when workflow response is missing json', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                data: {
                  main: [[{}]],
                },
              },
            ],
          },
        },
      },
    })

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(/empty response/i)
  })

  it('handleToolCall skips tools missing invocationId', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const tool: any = {
      id: 'w1',
      // invocationId intentionally missing
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toBeUndefined()
  })

  it('handleToolCall sets error when fetching n8n key fails', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    )

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(
      /Error running tool/i,
    )
  })

  it('handleToolCall sets error when n8n workflow returns an error object', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                error: { message: 'Boom', description: 'Bad input' },
              },
            ],
          },
        },
      },
    })

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].error).toMatch(/Boom/i)
  })

  it('handleToolCall returns imageUrls output when workflow responds with image_urls only', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                data: {
                  main: [[{ json: { image_urls: ['a.png'] } }]],
                },
              },
            ],
          },
        },
      },
    })

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toEqual({
      imageUrls: ['a.png'],
    })
  })

  it('handleToolCall keeps s3Paths alongside the other output fields', async () => {
    // s3_paths must survive next to data/image_urls — they are the raw keys
    // used to re-sign after the 1h presigned URLs expire.
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          data: { ok: true },
                          image_urls: ['https://signed.example/a.png'],
                          s3_paths: ['courses/cs101/a.png'],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
          },
        },
      },
    })

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toEqual({
      data: { ok: true },
      imageUrls: ['https://signed.example/a.png'],
      s3Paths: ['courses/cs101/a.png'],
    })
  })

  it('handleToolCall skips when last message has no tools array', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools).toBeUndefined()
  })

  it('handleToolCall skips when invocationId is not found on the last message tools list', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hi',
          tools: [{ ...tool, invocationId: 'other' }],
        },
      ],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toBeUndefined()
  })

  it('handleToolCall parses JSON "data" output and merges image_urls when present', async () => {
    const { handleToolCall } = await import('../handleFunctionCalling')
    const { runN8nFlowBackend } = await import(
      '~/pages/api/UIUC-api/runN8nFlow'
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify('n8n-key'), { status: 200 }),
    )
    ;(runN8nFlowBackend as any).mockResolvedValueOnce({
      data: {
        resultData: {
          lastNodeExecuted: 'final',
          runData: {
            final: [
              {
                data: {
                  main: [[{ json: { data: { a: 1 }, image_urls: ['x.png'] } }]],
                },
              },
            ],
          },
        },
      },
    })

    const tool: any = {
      id: 'w1',
      invocationId: 'inv1',
      name: 't',
      readableName: 'Tool',
      description: 'd',
      aiGeneratedArgumentValues: { a: 1 },
    }
    const conversation: any = {
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', tools: [tool] }],
    }

    await handleToolCall([tool], conversation, 'proj', 'http://localhost')
    expect(conversation.messages[0].tools[0].output).toEqual({
      data: { a: 1 },
      imageUrls: ['x.png'],
    })
  })
})
