'use client'
import { Bug, Copy } from 'lucide-react'
import { Button } from '@/components/shadcn/ui/button'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/shadcn/ui/trace'
import { CodeBlock } from './code-block'
export interface StackFrame {
  name: string
  file: string
  line?: number
  column?: number
  code?: string
}
export function StackTrace({
  error,
  frames = [],
  onFrameSelect,
}: {
  error: string
  frames?: StackFrame[]
  onFrameSelect?: (frame: StackFrame) => void
}) {
  return (
    <Trace>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status="error">
            <TraceIcon>
              <Bug />
            </TraceIcon>
            <TraceTitle>{error}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy stack trace"
              onClick={() =>
                void navigator.clipboard.writeText(
                  [
                    error,
                    ...frames.map(
                      (f) =>
                        `${f.name} (${f.file}:${f.line || 0}:${f.column || 0})`,
                    ),
                  ].join('\n'),
                )
              }
            >
              <Copy />
            </Button>
          </div>
          <ol className="space-y-2">
            {frames.map((frame, index) => (
              <li key={index} className="rounded-md border p-3">
                <button
                  type="button"
                  disabled={!onFrameSelect}
                  className="flex w-full items-center justify-between gap-4 text-left text-xs"
                  onClick={() => onFrameSelect?.(frame)}
                >
                  <span className="font-mono">{frame.name}</span>
                  <span className="text-muted-foreground">
                    {frame.file}
                    {frame.line ? `:${frame.line}` : ''}
                  </span>
                </button>
                {frame.code && (
                  <CodeBlock code={frame.code} language="typescript" />
                )}
              </li>
            ))}
          </ol>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
