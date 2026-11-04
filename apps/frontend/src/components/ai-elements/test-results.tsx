'use client'
import { Check, CircleDashed, X } from 'lucide-react'
import { Badge } from '@/components/shadcn/ui/badge'
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
export interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs?: number
  error?: string
}
export function TestResults({
  results,
  running = false,
}: {
  results: TestResult[]
  running?: boolean
}) {
  const failed = results.filter((t) => t.status === 'failed').length
  return (
    <Trace>
      <TraceCollapsible defaultOpen={failed > 0}>
        <TraceCollapsibleTrigger>
          <TraceLine
            status={running ? 'running' : failed ? 'error' : undefined}
          >
            <TraceIcon>{failed ? <X /> : <Check />}</TraceIcon>
            <TraceTitle>
              {running ? 'Running tests' : 'Test results'}
            </TraceTitle>
            <TraceDescription>
              {results.filter((t) => t.status === 'passed').length} passed
              {failed ? ` · ${failed} failed` : ''}
            </TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <ul className="space-y-2">
            {results.map((test, index) => (
              <li key={index} className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-xs">
                  {test.status === 'passed' ? (
                    <Check className="size-3.5 text-green-600" />
                  ) : test.status === 'failed' ? (
                    <X className="text-destructive size-3.5" />
                  ) : (
                    <CircleDashed className="size-3.5" />
                  )}
                  <span className="flex-1">{test.name}</span>
                  <Badge variant="secondary">
                    {test.durationMs !== undefined
                      ? `${test.durationMs} ms`
                      : test.status}
                  </Badge>
                </div>
                {test.error && (
                  <pre className="text-destructive mt-2 overflow-auto text-xs whitespace-pre-wrap">
                    {test.error}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
