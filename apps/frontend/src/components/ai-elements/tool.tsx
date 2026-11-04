'use client'

import { Badge } from '@/components/shadcn/ui/badge'
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/shadcn/ui/code-block'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/shadcn/ui/trace'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'

export type ToolPart = ToolUIPart | DynamicToolUIPart

type ToolState = ToolUIPart['state']
type TraceStatus = ComponentProps<typeof TraceLine>['status']

export type ToolProps = ComponentProps<typeof TraceCollapsible>

export const Tool = (props: ToolProps) => (
  <Trace>
    <TraceCollapsible {...props} />
  </Trace>
)

export type ToolHeaderProps = {
  title?: string
  type: ToolUIPart['type'] | DynamicToolUIPart['type']
  state: ToolState
  icon?: ReactNode
  description?: ReactNode
  className?: string
}

export function toolLine(
  state: ToolState,
  name: string,
): { status: TraceStatus; title: string } {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
    case 'approval-responded':
      return { status: 'running', title: `Running ${name}` }
    case 'approval-requested':
      return { status: 'pending', title: `Waiting to run ${name}` }
    case 'output-available':
      return { status: undefined, title: `Ran ${name}` }
    case 'output-error':
      return { status: 'error', title: `Failed to run ${name}` }
    case 'output-denied':
      return { status: undefined, title: `Denied ${name}` }
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}

export const getStatusBadge = (status: ToolState) => {
  const labels: Record<ToolState, string> = {
    'input-streaming': 'Pending',
    'input-available': 'Running',
    'approval-requested': 'Awaiting Approval',
    'approval-responded': 'Responded',
    'output-available': 'Completed',
    'output-error': 'Error',
    'output-denied': 'Denied',
  }

  const icons: Record<ToolState, ReactNode> = {
    'input-streaming': <CircleIcon className="size-4" />,
    'input-available': <ClockIcon className="size-4 animate-pulse" />,
    'approval-requested': <ClockIcon className="size-4 text-yellow-600" />,
    'approval-responded': <CheckCircleIcon className="size-4 text-blue-600" />,
    'output-available': <CheckCircleIcon className="size-4 text-green-600" />,
    'output-error': <XCircleIcon className="size-4 text-red-600" />,
    'output-denied': <XCircleIcon className="size-4 text-orange-600" />,
  }

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  )
}

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  icon,
  description,
}: ToolHeaderProps) => {
  const line = toolLine(state, title ?? type.split('-').slice(1).join('-'))
  return (
    <TraceCollapsibleTrigger className={className}>
      <TraceLine status={line.status}>
        <TraceIcon>{icon ?? <WrenchIcon />}</TraceIcon>
        <TraceTitle>{line.title}</TraceTitle>
        {description && <TraceDescription>{description}</TraceDescription>}
      </TraceLine>
    </TraceCollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof TraceCollapsibleContent>

export const ToolContent = (props: ToolContentProps) => (
  <TraceCollapsibleContent {...props} />
)

export type ToolInputProps = ComponentProps<'div'> & {
  input: ToolUIPart['input']
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <CodeBlock size="sm" className={className} {...props}>
    <CodeBlockHeader>
      <CodeBlockTitle>Input</CodeBlockTitle>
    </CodeBlockHeader>
    <CodeBlockContent wrap className="max-h-64">
      {JSON.stringify(input, null, 2)}
    </CodeBlockContent>
  </CodeBlock>
)

export type ToolOutputProps = ComponentProps<'div'> & {
  output: ToolUIPart['output']
  errorText: ToolUIPart['errorText']
}

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) return null

  if (!errorText && isValidElement(output))
    return (
      <div className={className} {...props}>
        {output}
      </div>
    )

  return (
    <CodeBlock
      size="sm"
      variant={errorText ? 'destructive' : 'default'}
      className={className}
      {...props}
    >
      <CodeBlockHeader>
        <CodeBlockTitle>{errorText ? 'Error' : 'Output'}</CodeBlockTitle>
      </CodeBlockHeader>
      <CodeBlockContent wrap className="max-h-64">
        {errorText ??
          (typeof output === 'string'
            ? output
            : JSON.stringify(output, null, 2))}
      </CodeBlockContent>
    </CodeBlock>
  )
}
