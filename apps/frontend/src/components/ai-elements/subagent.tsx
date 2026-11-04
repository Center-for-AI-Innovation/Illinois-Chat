'use client'
import { type ReactNode } from 'react'
import { Bot, LoaderCircle, CircleAlert } from 'lucide-react'
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
export function Subagent({
  name,
  description,
  status,
  children,
}: {
  name: string
  description?: string
  status: 'pending' | 'running' | 'done' | 'error'
  children?: ReactNode
}) {
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine status={status === 'done' ? undefined : status}>
            <TraceIcon>
              {status === 'running' ? (
                <LoaderCircle className="animate-spin" />
              ) : status === 'error' ? (
                <CircleAlert />
              ) : (
                <Bot />
              )}
            </TraceIcon>
            <TraceTitle>{name}</TraceTitle>
            <TraceDescription>{status}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {description && (
            <p className="text-muted-foreground mb-3 text-xs">{description}</p>
          )}
          {children}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
