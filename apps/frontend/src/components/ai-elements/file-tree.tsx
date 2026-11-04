'use client'
import { File, Folder } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/shadcn/ui/collapsible'
export interface FileTreeNode {
  name: string
  path: string
  children?: FileTreeNode[]
  status?: 'added' | 'modified' | 'deleted'
}
export function FileTree({
  files,
  onSelect,
}: {
  files: FileTreeNode[]
  onSelect?: (file: FileTreeNode) => void
}) {
  return (
    <ul className="space-y-1 text-xs" aria-label="Files">
      {files.map((file) => (
        <li key={file.path}>
          {file.children ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="hover:bg-muted flex w-full items-center gap-2 rounded-md p-2 text-left">
                <Folder className="size-4" />
                {file.name}
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                <FileTree files={file.children} onSelect={onSelect} />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <button
              type="button"
              disabled={!onSelect}
              className="enabled:hover:bg-muted flex w-full items-center gap-2 rounded-md p-2 text-left"
              onClick={() => onSelect?.(file)}
            >
              <File className="size-4" />
              <span className="flex-1">{file.name}</span>
              {file.status && (
                <span
                  className={
                    file.status === 'deleted'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }
                >
                  {file.status}
                </span>
              )}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
