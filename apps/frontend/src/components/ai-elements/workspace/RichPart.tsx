'use client'
import dynamic from 'next/dynamic'
import { z } from 'zod/v4'
import { type FileTreeNode } from '../file-tree'
const StackTrace = dynamic(() =>
  import('../stack-trace').then((m) => m.StackTrace),
)
const Terminal = dynamic(() => import('../terminal').then((m) => m.Terminal))
const TestResults = dynamic(() =>
  import('../test-results').then((m) => m.TestResults),
)
const FileTree = dynamic(() => import('../file-tree').then((m) => m.FileTree))
const Subagent = dynamic(() => import('../subagent').then((m) => m.Subagent))
const terminal = z.object({
  command: z.string(),
  output: z.string(),
  running: z.boolean().optional(),
  exitCode: z.number().optional(),
})
const stack = z.object({
  error: z.string(),
  frames: z
    .array(
      z.object({
        name: z.string(),
        file: z.string(),
        line: z.number().optional(),
        column: z.number().optional(),
        code: z.string().optional(),
      }),
    )
    .optional(),
})
const tests = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['passed', 'failed', 'skipped']),
      durationMs: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
  running: z.boolean().optional(),
})
const subagent = z.object({
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['pending', 'running', 'done', 'error']),
})
const fileNode: z.ZodType<FileTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    status: z.enum(['added', 'modified', 'deleted']).optional(),
    children: z.array(fileNode).optional(),
  }),
)
const files = z.object({ files: z.array(fileNode) })

/** Render typed backend events only; unsupported data stays out of the transcript. */
export function RichPart({ type, data }: { type: string; data: unknown }) {
  if (type === 'data-terminal') {
    const result = terminal.safeParse(data)
    return result.success ? <Terminal {...result.data} /> : null
  }
  if (type === 'data-stack-trace') {
    const result = stack.safeParse(data)
    return result.success ? <StackTrace {...result.data} /> : null
  }
  if (type === 'data-test-results') {
    const result = tests.safeParse(data)
    return result.success ? <TestResults {...result.data} /> : null
  }
  if (type === 'data-subagent') {
    const result = subagent.safeParse(data)
    return result.success ? <Subagent {...result.data} /> : null
  }
  if (type === 'data-file-tree') {
    const result = files.safeParse(data)
    return result.success ? <FileTree files={result.data.files} /> : null
  }
  return null
}
