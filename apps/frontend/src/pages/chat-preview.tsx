import { useMemo, useState } from 'react'
import Head from 'next/head'
import { useChat } from '@ai-sdk/react'
import { createChat } from '@shadcn/helpers/ai-sdk'
import {
  WorkspaceView,
  type Effort,
} from '@/components/ai-elements/workspace/WorkspaceView'
import { type Action, type UIUCTool } from '@/types/chat'

const models = [
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', contextWindow: 400000 },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    contextWindow: 200000,
  },
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    provider: 'Gemini',
    contextWindow: 1000000,
  },
]
const prompt = 'Explain recursion with a simple example.'

export default function ChatPreview() {
  const [modelId, setModelId] = useState(models[0]!.id)
  const [knowledge, setKnowledge] = useState(true)
  const [effort, setEffort] = useState<Effort>('medium')
  const [temperature, setTemperature] = useState(0.5)
  const [groups, setGroups] = useState<Action[]>([
    { id: 'DocGroup-all', name: 'All Documents', checked: true },
    { id: 'lectures', name: 'Lectures', checked: false },
    { id: 'labs', name: 'Labs', checked: false, adminDisabled: true },
  ])
  const [tools, setTools] = useState<UIUCTool[]>([
    {
      id: 'grades',
      name: 'grades',
      readableName: 'Gradebook lookup',
      description: 'Looks up your course grades.',
      enabled: true,
    },
  ])
  const script = useMemo(
    () =>
      createChat()
        .user(prompt)
        .assistant(({ writer }) => {
          writer
            .reasoning(
              'I’ll start with the simplest idea: a problem that contains a smaller version of itself. Then I’ll connect it to a concrete example.',
            )
            .sleep(500)
          writer
            .tool('updatePlan', {
              input: {
                title: 'Explain recursion',
                steps: [
                  { title: 'Find the course definition', status: 'done' },
                  { title: 'Walk through a countdown', status: 'in_progress' },
                  { title: 'Share a reusable example', status: 'pending' },
                ],
              },
            })
            .sleep(300)
            .output({ recorded: true })
          writer
            .tool('searchDocuments', {
              input: { query: 'recursion base case CS 124' },
            })
            .sleep(600)
            .output({
              sources: [
                {
                  title: 'CS 124 — Recursion',
                  url: 'https://www.cs124.org/',
                  text: 'A recursive solution needs a base case and a recursive step.',
                },
              ],
            })
          writer
            .text(
              'Recursion means solving a problem by solving a **smaller version of the same problem**.\n\n',
            )
            .sleep(350)
          writer
            .reasoning(
              'The source emphasizes a base case. A countdown is a clear example because each step reduces the number by one, and zero is the stopping point.',
            )
            .sleep(350)
          writer
            .tool('createArtifact', {
              input: {
                title: 'countdown.py',
                kind: 'code',
                language: 'python',
                content:
                  'def countdown(n: int) -> None:\n    """Print n, n-1, ..., 1."""\n    if n == 0:  # base case\n        return\n    print(n)\n    countdown(n - 1)  # smaller problem\n\n\nif __name__ == "__main__":\n    countdown(3)\n',
              },
            })
            .sleep(400)
            .output({ saved: true, title: 'countdown.py' })
          writer.text(
            '### Think of a countdown\n\nTo count down from 3:\n\n1. Say **3**, then count down from 2.\n2. Say **2**, then count down from 1.\n3. Say **1**, then stop at **0**.\n\n```python\ndef countdown(n):\n    if n == 0:        # base case\n        return\n    print(n)\n    countdown(n - 1)  # smaller problem\n```\n\nThe two ingredients are a **base case** that stops the process and a **recursive step** that makes progress toward it. See the [course materials](https://www.cs124.org/).\n\nWant to try writing a recursive function that adds the numbers from 1 to n?',
          )
        }),
    [],
  )
  const chat = useChat({
    transport: useMemo(
      () =>
        script.transport({
          fallback:
            'This is a scripted design preview. The project chat uses your configured models and real streamed responses.',
        }),
      [script],
    ),
  })
  return (
    <>
      <Head>
        <title>Illinois Chat · Workspace preview</title>
      </Head>
      <div className="flex h-dvh flex-col">
        <div className="flex h-8 shrink-0 items-center justify-center gap-3 bg-[#13294b] text-[10px] text-white">
          <span className="size-1.5 rounded-full bg-[#ff5f05]" />
          INTERFACE PREVIEW · Scripted responses · No API calls
        </div>
        <div className="min-h-0 flex-1">
          <WorkspaceView
            modelId={modelId}
            models={models}
            messages={chat.messages}
            status={chat.status}
            error={chat.error?.message}
            conversationId="preview"
            welcome={{
              projectName: 'CS 124',
              introMessage:
                'Welcome to CS 124. Ask about lectures, labs, and course policies. Course site: https://www.cs124.org/',
              examples: [
                prompt,
                'What connects these concepts?',
                'Help me plan my next project.',
              ],
            }}
            documents={{
              enabled: knowledge,
              locked: false,
              groups,
              onEnabledChange: setKnowledge,
              onToggleGroup: (id) =>
                setGroups((current) =>
                  current.map((g) =>
                    g.id === id && !g.adminDisabled
                      ? { ...g, checked: !g.checked }
                      : g,
                  ),
                ),
            }}
            tools={{
              tools,
              onToggle: (id, enabled) =>
                setTools((current) =>
                  current.map((t) => (t.id === id ? { ...t, enabled } : t)),
                ),
            }}
            settings={{
              reasoning: modelId !== 'gemini-3.1-pro',
              effort,
              temperature,
              onEffortChange: setEffort,
              onTemperatureChange: setTemperature,
            }}
            onModelChange={setModelId}
            onNew={() => {
              void chat.stop()
              chat.setMessages([])
            }}
            onSend={({ text, files }) => {
              void chat.sendMessage({
                text,
                ...(files.length ? { files } : {}),
              })
            }}
            onRestore={(messageId) => {
              const index = chat.messages.findIndex((m) => m.id === messageId)
              if (index >= 0)
                chat.setMessages(chat.messages.slice(0, index + 1))
            }}
            onStop={() => {
              void chat.stop()
            }}
            onRetry={() => {
              void chat.regenerate()
            }}
          />
        </div>
      </div>
    </>
  )
}
