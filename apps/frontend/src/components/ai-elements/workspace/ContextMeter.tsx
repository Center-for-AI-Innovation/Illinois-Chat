'use client'
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from '@/components/ai-elements/context'
import { type WorkspaceMetadata } from '@/types/workspace'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })

export function ContextMeter({
  usedTokens,
  maxTokens,
  usage,
}: {
  usedTokens: number
  maxTokens: number
  usage?: WorkspaceMetadata['usage']
}) {
  const rows = [
    ['Input', usage?.inputTokens],
    ['Output', usage?.outputTokens],
    ['Reasoning', usage?.outputTokenDetails?.reasoningTokens],
    ['Cached input', usage?.inputTokenDetails?.cacheReadTokens],
  ] as const
  return (
    <Context usedTokens={Math.min(usedTokens, maxTokens)} maxTokens={maxTokens}>
      <ContextTrigger
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs text-(--ws-muted) hover:text-(--ws-heading) [&>span]:hidden @[44rem]/composer:[&>span]:inline"
        aria-label="Context window usage"
      />
      <ContextContent className="w-64">
        <ContextContentHeader />
        <ContextContentBody className="space-y-1.5">
          <p className="text-muted-foreground pb-1 text-xs">
            Last reply in this conversation
          </p>
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">
                  {compact.format(value ?? 0)} tokens
                </span>
              </div>
            ))}
        </ContextContentBody>
      </ContextContent>
    </Context>
  )
}
