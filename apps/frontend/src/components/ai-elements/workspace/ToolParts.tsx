'use client'
import {
  Circle,
  CircleCheck,
  CircleDot,
  Code2,
  FileText,
  Globe,
  PanelRightOpen,
  Search,
  Wrench,
} from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
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
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  toolLine,
} from '@/components/ai-elements/tool'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation'
import { Loader } from '@/components/ai-elements/loader'
import {
  planInputSchema,
  searchInputSchema,
  type ArtifactKind,
  type PlanStepStatus,
  type WorkspaceArtifact,
} from '@/types/workspace'
import {
  isRunning,
  safeUrl,
  searchSources,
  toolName,
  type ToolPart,
} from './workspaceParts'

export function SearchTask({ part }: { part: ToolPart }) {
  const running = isRunning(part)
  const query = searchInputSchema.safeParse(part.input).data?.query
  const sources = searchSources(part)
  const failed = part.state === 'output-error'
  const verb = running
    ? 'Searching project knowledge'
    : failed
      ? 'Could not search project knowledge'
      : 'Searched project knowledge'
  const line = (
    <TraceLine status={running ? 'running' : failed ? 'error' : undefined}>
      <TraceIcon>
        <Search />
      </TraceIcon>
      <TraceTitle>
        {verb}
        {query && <span className="text-(--ws-text)"> for “{query}”</span>}
      </TraceTitle>
      {!running && !failed && (
        <TraceDescription>
          {sources.length} {sources.length === 1 ? 'passage' : 'passages'}
        </TraceDescription>
      )}
    </TraceLine>
  )
  if (running) return <Trace className="my-1">{line}</Trace>
  return (
    <Trace className="my-1">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          {failed && <p>{part.errorText || 'The search could not finish.'}</p>}
          {!failed && !sources.length && (
            <p>No matching passages were found.</p>
          )}
          {sources.length > 0 && (
            <ul className="space-y-2.5">
              {sources.map((source, index) => {
                const url = safeUrl(source.url)
                const label = source.page
                  ? `${source.title} · p. ${source.page}`
                  : source.title
                return (
                  <li
                    key={`${source.title}-${index}`}
                    className="min-w-0 space-y-0.5"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-sm">
                      <FileText className="size-3.5 shrink-0 text-(--ws-accent)" />
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-(--ws-link) hover:text-(--ws-accent) hover:underline"
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="truncate text-(--ws-text)">
                          {label}
                        </span>
                      )}
                    </span>
                    {source.text && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-(--ws-muted)">
                        {source.text}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

function StepIcon({
  status,
  running,
}: {
  status: PlanStepStatus
  running: boolean
}) {
  switch (status) {
    case 'done':
      return <CircleCheck className="size-4 shrink-0 text-(--ws-done)" />
    case 'in_progress':
      return running ? (
        <Loader size={16} className="shrink-0 text-(--ws-accent)" />
      ) : (
        <CircleDot className="size-4 shrink-0 text-(--ws-accent)" />
      )
    case 'pending':
      return <Circle className="size-4 shrink-0 text-(--ws-line)" />
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

export function PlanCard({
  part,
  running,
}: {
  part: ToolPart
  running: boolean
}) {
  const plan = planInputSchema.partial().safeParse(part.input).data
  if (!plan?.title) return null
  const steps = (plan.steps ?? []).filter((step) => step?.title)
  const done = steps.filter((step) => step.status === 'done').length
  return (
    <Plan
      defaultOpen
      isStreaming={part.state === 'input-streaming'}
      className="my-2 gap-0 rounded-xl border-0 bg-(--ws-fill) py-0 shadow-none"
    >
      <PlanHeader className="gap-3 border-b border-(--ws-surface) px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold tracking-wider text-(--ws-accent) uppercase">
            Plan · {done} of {steps.length} done
          </p>
          <PlanTitle className="font-wsDisplay text-base leading-snug font-semibold text-(--ws-heading)">
            {plan.title}
          </PlanTitle>
          {plan.description && (
            <PlanDescription className="text-sm text-(--ws-muted)">
              {plan.description}
            </PlanDescription>
          )}
        </div>
        <PlanAction>
          <PlanTrigger className="text-(--ws-muted)" />
        </PlanAction>
      </PlanHeader>
      <PlanContent className="px-4 py-3 sm:px-5">
        <ol className="space-y-2.5">
          {steps.map((step, index) => (
            <li
              key={`${step.title}-${index}`}
              className="flex items-start gap-3 text-sm"
            >
              <StepIcon status={step.status ?? 'pending'} running={running} />
              <span
                className={
                  step.status === 'done'
                    ? 'text-(--ws-muted)'
                    : 'text-(--ws-text)'
                }
              >
                {step.title}
              </span>
            </li>
          ))}
        </ol>
      </PlanContent>
      {steps.length > 0 && (
        <div
          className="h-1 overflow-hidden rounded-b-xl bg-(--ws-sidebar-accent)"
          role="progressbar"
          aria-label="Plan progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-(--ws-orange) transition-[width] duration-500"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      )}
    </Plan>
  )
}

export const artifactIcons: Record<ArtifactKind, typeof FileText> = {
  document: FileText,
  code: Code2,
  html: Globe,
}

export const artifactLabels: Record<ArtifactKind, string> = {
  document: 'Document',
  code: 'Code',
  html: 'Web page',
}

export function ArtifactChip({
  artifact,
  active,
  onOpen,
}: {
  artifact: WorkspaceArtifact
  active: boolean
  onOpen: (id: string) => void
}) {
  const Icon = artifactIcons[artifact.kind]
  return (
    <button
      type="button"
      onClick={() => onOpen(artifact.id)}
      aria-pressed={active}
      className="group/artifact my-2 flex w-full max-w-md items-center gap-3 rounded-xl bg-(--ws-fill) p-3 text-left transition-[background-color,box-shadow] hover:bg-(--ws-fill-hover) hover:shadow-(--ws-elevation) aria-pressed:bg-(--ws-fill-hover) aria-pressed:shadow-(--ws-elevation)"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-(--ws-blue) text-white dark:bg-(--ws-orange) dark:text-(--ws-blue)">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-(--ws-heading)">
          {artifact.title}
        </span>
        <span className="block text-xs text-(--ws-muted)">
          {artifact.streaming ? 'Writing…' : artifactLabels[artifact.kind]}
          {artifact.language && artifact.kind === 'code'
            ? ` · ${artifact.language}`
            : ''}
        </span>
      </span>
      {artifact.streaming ? (
        <Loader size={16} className="shrink-0 text-(--ws-accent)" />
      ) : (
        <PanelRightOpen className="size-4 shrink-0 text-(--ws-muted) group-hover/artifact:text-(--ws-heading)" />
      )}
    </button>
  )
}

const codeSurface =
  'border-0 bg-(--ws-fill) text-(--ws-text) dark:bg-(--ws-fill) [&_[data-slot=code-block-title]]:font-medium [&_[data-slot=code-block-title]]:text-(--ws-muted)'

export function ToolCall({
  part,
  onApproval,
}: {
  part: ToolPart
  onApproval?: (id: string, approved: boolean) => void
}) {
  const name = toolName(part)
  const output = 'output' in part ? part.output : undefined
  const errorText = 'errorText' in part ? part.errorText : undefined
  const line =
    part.state === 'approval-responded' && part.approval?.approved === false
      ? toolLine('output-denied', name)
      : toolLine(part.state, name)
  return (
    <div className="my-2 flex flex-col gap-2">
      {output !== undefined || errorText ? (
        <Tool>
          <ToolHeader type={`tool-${name}`} state={part.state} title={name} />
          <ToolContent className="space-y-2">
            <ToolInput input={part.input} className={codeSurface} />
            <ToolOutput
              output={output}
              errorText={errorText}
              className={cn(
                codeSurface,
                errorText &&
                  'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 [&_[data-slot=code-block-title]]:text-current',
              )}
            />
          </ToolContent>
        </Tool>
      ) : (
        <Trace>
          <TraceLine status={line.status}>
            <TraceIcon>
              <Wrench />
            </TraceIcon>
            <TraceTitle>{line.title}</TraceTitle>
          </TraceLine>
        </Trace>
      )}
      <Confirmation
        approval={part.approval}
        state={part.state}
        className="rounded-xl border-0 bg-(--ws-fill) px-4 py-3"
      >
        <ConfirmationTitle className="text-sm text-(--ws-text)">
          <ConfirmationRequest>
            Illinois Chat wants to run <strong>{name}</strong>. Allow it?
          </ConfirmationRequest>
          <ConfirmationAccepted>
            You allowed <strong>{name}</strong>.
          </ConfirmationAccepted>
          <ConfirmationRejected>
            You declined <strong>{name}</strong>.
          </ConfirmationRejected>
        </ConfirmationTitle>
        <ConfirmationActions>
          <ConfirmationAction
            variant="outline"
            disabled={!onApproval || !part.approval}
            onClick={() =>
              part.approval && onApproval?.(part.approval.id, false)
            }
          >
            Decline
          </ConfirmationAction>
          <ConfirmationAction
            disabled={!onApproval || !part.approval}
            onClick={() =>
              part.approval && onApproval?.(part.approval.id, true)
            }
          >
            Allow
          </ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  )
}
