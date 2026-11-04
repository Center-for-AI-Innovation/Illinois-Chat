'use client'
import { Fragment, type ReactNode } from 'react'
import {
  ArrowRight,
  BookOpen,
  Compass,
  Lightbulb,
  MessageCircleQuestion,
} from 'lucide-react'
import { Suggestion } from '@/components/ai-elements/suggestion'

const EXAMPLE_ICONS = [Lightbulb, BookOpen, Compass, MessageCircleQuestion]

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((chunk, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={chunk}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-(--ws-link) underline-offset-2 hover:text-(--ws-accent) hover:underline"
      >
        {chunk.replace(/^https?:\/\//, '')}
      </a>
    ) : (
      <Fragment key={index}>{chunk}</Fragment>
    ),
  )
}

export interface EmptyStateProps {
  projectName: string
  introMessage?: string
  examples: string[]
  notice?: ReactNode
  onPick: (example: string) => void
}

export function EmptyState({
  projectName,
  introMessage,
  examples,
  notice,
  onPick,
}: EmptyStateProps) {
  return (
    <div className="m-auto flex w-full max-w-3xl flex-col px-3 py-8 sm:px-6 sm:py-12">
      <span aria-hidden className="h-1 w-10 rounded-full bg-(--ws-orange)" />
      <h2 className="font-wsDisplay mt-4 text-2xl leading-tight font-bold text-(--ws-heading) sm:text-4xl">
        {projectName}
      </h2>
      {introMessage && (
        <p className="mt-4 text-base leading-7 whitespace-pre-wrap text-(--ws-text) sm:text-lg sm:leading-8">
          {linkify(introMessage)}
        </p>
      )}
      {notice}
      {examples.length > 0 && (
        <section aria-label="Example questions" className="mt-10">
          <p className="text-sm text-(--ws-muted)">
            Start a conversation below or try these examples
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
            {examples.map((example, index) => {
              const Icon = EXAMPLE_ICONS[index % EXAMPLE_ICONS.length]!
              return (
                <Suggestion
                  key={example}
                  suggestion={example}
                  onClick={onPick}
                  variant="ghost"
                  title={example}
                  className="group h-full flex-col items-start justify-start gap-3 rounded-xl border-0 bg-(--ws-fill) p-4 text-left whitespace-normal shadow-none transition-[background-color,box-shadow] hover:bg-(--ws-fill-hover) hover:shadow-(--ws-elevation) focus-visible:ring-2 focus-visible:ring-(--ws-accent)"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-(--ws-raised) text-(--ws-accent) shadow-(--ws-elevation)">
                    <Icon className="size-4" />
                  </span>
                  <span className="line-clamp-4 text-sm leading-relaxed font-normal text-(--ws-text)">
                    {example}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-(--ws-muted) transition-colors group-hover:text-(--ws-link)">
                    Ask this
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Suggestion>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
