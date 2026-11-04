import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type UIMessage } from 'ai'
import { WorkspaceView, type WorkspaceViewProps } from '../WorkspaceView'

function props(
  overrides: Partial<WorkspaceViewProps> = {},
): WorkspaceViewProps {
  return {
    modelId: 'gpt-5.4',
    models: [
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        provider: 'OpenAI',
        contextWindow: 400000,
      },
    ],
    messages: [],
    status: 'ready',
    conversationId: 'c',
    welcome: {
      projectName: 'CS 124',
      introMessage: 'Welcome to CS 124. Visit https://cs124.org for details.',
      examples: ['Explain recursion'],
    },
    settings: {
      reasoning: true,
      effort: 'medium',
      temperature: 0.5,
      onEffortChange: vi.fn(),
      onTemperatureChange: vi.fn(),
    },
    onModelChange: vi.fn(),
    onNew: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

const text = (
  id: string,
  role: UIMessage['role'],
  value: string,
): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: value }],
})

const input = () => screen.getByRole('textbox', { name: 'Message input' })

describe('workspace welcome', () => {
  it('shows the configured greeting with links', () => {
    render(<WorkspaceView {...props()} />)
    expect(screen.getByRole('heading', { name: 'CS 124' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'cs124.org' })).toHaveAttribute(
      'href',
      'https://cs124.org',
    )
  })
  it('fills the composer from an example question without sending it', async () => {
    const options = props()
    render(<WorkspaceView {...options} />)
    await userEvent.click(
      screen.getByRole('button', { name: /Explain recursion/ }),
    )
    expect(input()).toHaveValue('Explain recursion')
    expect(options.onSend).not.toHaveBeenCalled()
  })
})

describe('workspace composer', () => {
  it('shows token usage from the start and labels reasoning effort', async () => {
    const options = props()
    render(<WorkspaceView {...options} />)
    expect(
      screen.getByRole('button', { name: 'Context window usage' }),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reasoning effort: Medium' }),
    )
    await userEvent.click(await screen.findByRole('radio', { name: 'High' }))
    expect(options.settings.onEffortChange).toHaveBeenCalledWith('high')
  })
  it('offers temperature instead of effort for non-reasoning models', () => {
    render(
      <WorkspaceView
        {...props({
          settings: { ...props().settings, reasoning: false },
        })}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Temperature: 0.5' }),
    ).toBeInTheDocument()
  })
  it('lets users pick document groups but not admin-disabled ones', async () => {
    const onToggleGroup = vi.fn()
    render(
      <WorkspaceView
        {...props({
          documents: {
            enabled: true,
            locked: false,
            groups: [
              { id: 'DocGroup-all', name: 'All Documents', checked: true },
              { id: 'l', name: 'Lectures', checked: false },
              { id: 'x', name: 'Archive', checked: false, adminDisabled: true },
            ],
            onEnabledChange: vi.fn(),
            onToggleGroup,
          },
        })}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Project documents: All documents' }),
    )
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Lectures' }),
    )
    expect(onToggleGroup).toHaveBeenCalledWith('l')
    expect(screen.getByRole('checkbox', { name: 'Archive' })).toBeDisabled()
  })
  it('sends with Enter and preserves Shift+Enter for a newline', async () => {
    const options = props()
    render(<WorkspaceView {...options} />)
    await userEvent.type(input(), 'First{Shift>}{Enter}{/Shift}Second{Enter}')
    await waitFor(() =>
      expect(options.onSend).toHaveBeenCalledWith({
        text: 'First\nSecond',
        files: [],
      }),
    )
    await waitFor(() => expect(input()).toHaveValue(''))
  })
  it('exposes a stop action while streaming and disables model changes', async () => {
    const options = props({ status: 'streaming' })
    render(<WorkspaceView {...options} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop response' }))
    expect(options.onStop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Select model' })).toBeDisabled()
  })
  it('surfaces errors accessibly without discarding the draft', async () => {
    render(<WorkspaceView {...props({ error: 'Provider unavailable' })} />)
    await userEvent.type(input(), 'Keep my draft')
    expect(screen.getByRole('alert')).toHaveTextContent('Provider unavailable')
    expect(input()).toHaveValue('Keep my draft')
  })
  it('queues follow-ups while streaming and sends them once the reply finishes', async () => {
    const options = props({ status: 'streaming' })
    const view = render(<WorkspaceView {...options} />)
    await userEvent.type(input(), 'Next question{Enter}')
    expect(await screen.findByText('Next question')).toBeInTheDocument()
    expect(options.onSend).not.toHaveBeenCalled()
    view.rerender(<WorkspaceView {...options} status="ready" />)
    await waitFor(() =>
      expect(options.onSend).toHaveBeenCalledWith({
        text: 'Next question',
        files: [],
      }),
    )
  })
})

const artifactMessage = (id: string, title: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: [
    {
      type: 'tool-createArtifact',
      toolCallId: `call-${id}`,
      state: 'output-available',
      input: { title, kind: 'document', content: `# ${title}` },
      output: { ok: true },
    },
  ],
})

describe('workspace artifacts', () => {
  it('lets users choose any earlier artifact, not only the latest', async () => {
    render(
      <WorkspaceView
        {...props({
          messages: [
            text('u1', 'user', 'Draft'),
            artifactMessage('a1', 'First draft'),
            text('u2', 'user', 'Again'),
            artifactMessage('a2', 'Second draft'),
          ],
        })}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Open an artifact' }),
    )
    const menu = await screen.findByText('Artifacts in this conversation')
    await userEvent.click(
      within(menu.parentElement!).getByRole('button', { name: /First draft/ }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Open an artifact' }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('workspace user messages', () => {
  it('edits an earlier question and resends it in place', async () => {
    const onEdit = vi.fn()
    render(
      <WorkspaceView
        {...props({
          onEdit,
          messages: [
            text('u1', 'user', 'First'),
            text('a1', 'assistant', 'First answer'),
          ],
        })}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Copy message' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit message' }))
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    await userEvent.clear(editor)
    await userEvent.type(editor, 'Revised{Enter}')
    expect(onEdit).toHaveBeenCalledWith('u1', 'Revised')
  })
  it('hides editing while a reply is streaming', () => {
    render(
      <WorkspaceView
        {...props({
          onEdit: vi.fn(),
          status: 'streaming',
          messages: [text('u1', 'user', 'First')],
        })}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Edit message' }),
    ).not.toBeInTheDocument()
  })
})

describe('workspace feedback', () => {
  const answered = [
    text('u1', 'user', 'Question'),
    text('a1', 'assistant', 'Answer'),
  ]
  it('records a good response with one click', async () => {
    const onFeedback = vi.fn()
    render(<WorkspaceView {...props({ onFeedback, messages: answered })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Good response' }))
    expect(onFeedback).toHaveBeenCalledWith('a1', {
      isPositive: true,
      category: null,
      details: null,
    })
  })
  it('asks what went wrong before recording a bad response', async () => {
    const onFeedback = vi.fn()
    render(<WorkspaceView {...props({ onFeedback, messages: answered })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bad response' }))
    expect(onFeedback).not.toHaveBeenCalled()
    await userEvent.click(
      await screen.findByRole('radio', { name: 'Not factually correct' }),
    )
    await userEvent.type(
      screen.getByPlaceholderText('What should the answer have said?'),
      'Wrong date',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(onFeedback).toHaveBeenCalledWith('a1', {
      isPositive: false,
      category: 'inaccurate',
      details: 'Wrong date',
    })
  })
})

describe('workspace checkpoints', () => {
  it('restores to an earlier reply only after confirmation', async () => {
    const onRestore = vi.fn()
    render(
      <WorkspaceView
        {...props({
          onRestore,
          messages: [
            text('u1', 'user', 'First'),
            text('a1', 'assistant', 'First answer'),
            text('u2', 'user', 'Second'),
            text('a2', 'assistant', 'Second answer'),
          ],
        })}
      />,
    )
    const triggers = screen.getAllByRole('button', {
      name: 'Restore checkpoint',
    })
    expect(triggers).toHaveLength(1)
    await userEvent.click(triggers[0]!)
    expect(onRestore).not.toHaveBeenCalled()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore' }),
    )
    expect(onRestore).toHaveBeenCalledWith('a1')
  })
})
