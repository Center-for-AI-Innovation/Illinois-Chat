import { describe, expect, it } from 'vitest'
import { type UIMessage } from 'ai'
import {
  collectArtifacts,
  expandCitations,
  searchSources,
  type ToolPart,
} from '../workspaceParts'

const artifactMessage = (state: string, input: unknown): UIMessage => ({
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-createArtifact',
      toolCallId: 'call-1',
      state,
      input,
    } as UIMessage['parts'][number],
  ],
})

describe('collectArtifacts', () => {
  it('streams content while a later field is still half written', () => {
    const [artifact] = collectArtifacts([
      artifactMessage('input-streaming', {
        title: 'countdown.py',
        kind: 'co',
        content: 'def countdown(n):',
      }),
    ])
    expect(artifact).toMatchObject({
      title: 'countdown.py',
      kind: 'document',
      content: 'def countdown(n):',
      streaming: true,
    })
  })

  it('waits for a title before showing an artifact', () => {
    expect(
      collectArtifacts([artifactMessage('input-streaming', { kind: 'code' })]),
    ).toEqual([])
  })
})

describe('searchSources', () => {
  it('accepts numeric pages and null urls from the retrieval backend', () => {
    const part = {
      type: 'tool-searchDocuments',
      toolCallId: 'call-2',
      state: 'output-available',
      input: { query: 'viral oncology' },
      output: {
        sources: [{ title: 'Paper.pdf', text: 'Passage', url: null, page: 1 }],
      },
    } as unknown as ToolPart
    expect(searchSources(part)).toEqual([
      { title: 'Paper.pdf', text: 'Passage', url: undefined, page: '1' },
    ])
  })
})

describe('expandCitations', () => {
  const sources = [
    { n: 1, title: 'Week 1.pdf', url: 'https://example.com/week1', page: '3' },
    { n: 2, title: 'Paper.pdf', text: 'Passage' },
  ]

  it('turns a cite tag into a markdown link with the filename and page', () => {
    expect(expandCitations('See this <cite>1</cite>.', sources)).toBe(
      'See this [Week 1.pdf, p.3](https://example.com/week1#page=3 "Citation 1").',
    )
  })

  it('keeps a numbered sentinel when the passage has no url', () => {
    expect(expandCitations('From the paper <cite>2</cite>.', sources)).toBe(
      'From the paper [Paper.pdf](#cite-2 "Citation 2").',
    )
  })

  it('expands several indices in one tag', () => {
    expect(expandCitations('Both <cite>1, 2</cite>.', sources)).toContain(
      '[Week 1.pdf, p.3](https://example.com/week1#page=3 "Citation 1"); [Paper.pdf](#cite-2 "Citation 2")',
    )
  })
})
