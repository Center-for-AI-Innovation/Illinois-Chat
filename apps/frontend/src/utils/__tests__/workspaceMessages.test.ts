import { describe, expect, it } from 'vitest'
import { toWorkspaceMessage, fromWorkspaceMessage } from '../workspaceMessages'
import { type UIMessage } from 'ai'

describe('workspace message history', () => {
  it('keeps multiple reasoning phases in their original position', () => {
    const message = toWorkspaceMessage({
      id: 'm',
      role: 'assistant',
      content:
        '<think>first</think>First update.<think>second</think>Final answer.',
    })
    expect(message.parts).toEqual([
      { type: 'reasoning', text: 'first', state: 'done' },
      { type: 'text', text: 'First update.' },
      { type: 'reasoning', text: 'second', state: 'done' },
      { type: 'text', text: 'Final answer.' },
    ])
  })
  it('preserves tools, sources, file attachments and reasoning through persistence', () => {
    const message: UIMessage = {
      id: 'm',
      role: 'assistant',
      parts: [
        {
          type: 'reasoning',
          text: 'thinking',
          state: 'done',
          providerMetadata: {
            openai: {
              itemId: 'reason-1',
              reasoningEncryptedContent: 'opaque-provider-state',
            },
          },
        },
        {
          type: 'dynamic-tool',
          toolName: 'searchDocuments',
          toolCallId: 't',
          state: 'output-available',
          input: { query: 'test' },
          output: { sources: [] },
        },
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'paper.pdf',
          url: 'https://example.com/paper.pdf',
        },
        {
          type: 'source-url',
          sourceId: 'source-1',
          url: 'https://example.com',
        },
        { type: 'text', text: 'answer' },
      ],
    }
    expect(toWorkspaceMessage(fromWorkspaceMessage(message))).toEqual(message)
    expect(fromWorkspaceMessage(message).content).toBe(
      '<think>thinking</think>answer',
    )
  })
  it('reads legacy content arrays', () => {
    expect(
      toWorkspaceMessage({
        id: 'm',
        role: 'user',
        content: [
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ],
      }).parts,
    ).toEqual([{ type: 'text', text: 'one\ntwo' }])
  })
  it('keeps legacy document attachments and only their own passages', () => {
    const message = toWorkspaceMessage({
      id: 'm',
      role: 'user',
      content: [
        { type: 'text', text: 'summarize this' },
        {
          type: 'file',
          fileName: 'notes.pdf',
          fileUrl: 'cs101/notes.pdf',
          fileType: 'application/pdf',
        },
      ],
      contexts: [
        {
          readable_filename: 'notes.pdf',
          text: 'Upload passage',
          pagenumber: '2',
        },
        { readable_filename: 'Lecture 1.pdf', text: 'Retrieved passage' },
      ] as never,
    })
    expect(message.parts).toEqual([{ type: 'text', text: 'summarize this' }])
    expect(message.metadata).toEqual({
      uploads: {
        files: [{ name: 'notes.pdf', mediaType: 'application/pdf' }],
        contexts: [{ title: 'notes.pdf', text: 'Upload passage', page: '2' }],
      },
    })
  })
  it('reads unfinished reasoning from old conversations without showing tags', () => {
    expect(
      toWorkspaceMessage({
        id: 'm',
        role: 'assistant',
        content: '<think>still thinking',
      }).parts,
    ).toEqual([{ type: 'reasoning', text: 'still thinking', state: 'done' }])
  })
})
