'use client'
import { useState } from 'react'
import { Check, Code2, Copy, Download, Eye } from 'lucide-react'
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact'
import { CodeBlock } from '@/components/ai-elements/code-block'
import { MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  WebPreview,
  WebPreviewBody,
} from '@/components/ai-elements/web-preview'
import { cn } from '@/components/shadcn/lib/utils'
import { type WorkspaceArtifact } from '@/types/workspace'
import { workspaceMarkdownPlugins } from './markdownPlugins'
import { artifactFilename, codeLanguage } from './workspaceParts'

const kindLabels: Record<WorkspaceArtifact['kind'], string> = {
  document: 'Document',
  code: 'Code',
  html: 'Web page',
}

function download(artifact: WorkspaceArtifact) {
  const type =
    artifact.kind === 'html'
      ? 'text/html'
      : artifact.kind === 'document'
        ? 'text/markdown'
        : 'text/plain'
  const url = URL.createObjectURL(new Blob([artifact.content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = artifactFilename(artifact)
  link.click()
  URL.revokeObjectURL(url)
}

function ArtifactBody({
  artifact,
  view,
}: {
  artifact: WorkspaceArtifact
  view: 'preview' | 'source'
}) {
  if (artifact.streaming && artifact.kind !== 'document')
    return (
      <pre className="p-4 font-mono text-sm leading-6 break-words whitespace-pre-wrap text-(--ws-text)">
        {artifact.content}
      </pre>
    )
  switch (artifact.kind) {
    case 'document':
      return (
        <div className="mx-auto max-w-2xl px-5 py-6 sm:px-8">
          <MessageResponse
            isAnimating={artifact.streaming}
            plugins={workspaceMarkdownPlugins}
            linkSafety={{ enabled: false }}
            className="[&_h1]:font-wsDisplay [&_h2]:font-wsDisplay [&_h3]:font-wsDisplay text-base leading-7 text-(--ws-text) [&_h1]:text-(--ws-heading) [&_h2]:text-(--ws-heading) [&_h3]:text-(--ws-heading)"
          >
            {artifact.content}
          </MessageResponse>
        </div>
      )
    case 'code':
      return (
        <CodeBlock
          code={artifact.content}
          language={codeLanguage(artifact.language)}
          showLineNumbers
          className="rounded-none border-0"
        />
      )
    case 'html':
      return view === 'preview' ? (
        <WebPreview className="h-full rounded-none border-0">
          <WebPreviewBody
            srcDoc={artifact.content}
            sandbox="allow-scripts"
            title={`${artifact.title} preview`}
            className="bg-white"
          />
        </WebPreview>
      ) : (
        <CodeBlock
          code={artifact.content}
          language="html"
          showLineNumbers
          className="rounded-none border-0"
        />
      )
    default: {
      const unreachable: never = artifact.kind
      return unreachable
    }
  }
}

export function ArtifactPanel({
  artifact,
  className,
  onClose,
}: {
  artifact: WorkspaceArtifact
  className?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<'preview' | 'source'>('preview')
  return (
    <Artifact
      className={cn(
        'h-full rounded-none border-0 bg-(--ws-surface) shadow-none',
        className,
      )}
    >
      <ArtifactHeader className="gap-3 border-b border-(--ws-line) bg-(--ws-surface) px-4 py-3">
        <div className="min-w-0">
          <ArtifactTitle className="font-wsDisplay truncate text-base font-semibold text-(--ws-heading)">
            {artifact.title}
          </ArtifactTitle>
          <ArtifactDescription className="text-xs text-(--ws-muted)">
            {artifact.streaming ? (
              <Shimmer as="span" className="text-xs">
                Writing
              </Shimmer>
            ) : (
              <>
                {kindLabels[artifact.kind]}
                {artifact.kind === 'code' && artifact.language
                  ? ` · ${artifact.language}`
                  : ''}
              </>
            )}
          </ArtifactDescription>
        </div>
        <ArtifactActions className="shrink-0 text-(--ws-muted)">
          {artifact.kind === 'html' && (
            <ArtifactAction
              tooltip={view === 'preview' ? 'View source' : 'View page'}
              icon={view === 'preview' ? Code2 : Eye}
              onClick={() =>
                setView((current) =>
                  current === 'preview' ? 'source' : 'preview',
                )
              }
            />
          )}
          <ArtifactAction
            tooltip={copied ? 'Copied' : 'Copy'}
            icon={copied ? Check : Copy}
            disabled={artifact.streaming}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(artifact.content)
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              } catch {
                setCopied(false)
              }
            }}
          />
          <ArtifactAction
            tooltip="Download"
            icon={Download}
            disabled={artifact.streaming}
            onClick={() => download(artifact)}
          />
          <ArtifactClose onClick={onClose} aria-label="Close artifact" />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="min-h-0 p-0">
        <ArtifactBody artifact={artifact} view={view} />
      </ArtifactContent>
    </Artifact>
  )
}
