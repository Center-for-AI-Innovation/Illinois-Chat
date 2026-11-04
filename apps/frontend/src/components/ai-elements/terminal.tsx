'use client'
import { Terminal as TerminalIcon, LoaderCircle } from 'lucide-react'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
  TraceDescription,
} from '@/components/shadcn/ui/trace'
export function Terminal({
  command,
  output,
  running = false,
  exitCode,
}: {
  command: string
  output: string
  running?: boolean
  exitCode?: number
}) {
  return (
    <Trace>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine
            status={running ? 'running' : exitCode ? 'error' : undefined}
          >
            <TraceIcon>
              {running ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <TerminalIcon />
              )}
            </TraceIcon>
            <TraceTitle className="font-mono">{command}</TraceTitle>
            <TraceDescription>
              {running
                ? 'Running'
                : exitCode !== undefined
                  ? `Exit ${exitCode}`
                  : 'Complete'}
            </TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <pre
            className="bg-muted max-h-96 overflow-auto rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap"
            aria-live={running ? 'polite' : 'off'}
          >
            {output}
          </pre>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
