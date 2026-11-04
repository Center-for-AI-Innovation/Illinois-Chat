'use client'
import { ListOrdered, X } from 'lucide-react'
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemFile,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue'
import { type FileUIPart } from 'ai'

export interface QueuedMessage {
  id: string
  text: string
  files: FileUIPart[]
}

export function QueueTray({
  queue,
  onRemove,
}: {
  queue: QueuedMessage[]
  onRemove: (id: string) => void
}) {
  if (!queue.length) return null
  return (
    <Queue className="mb-2 rounded-xl border-(--ws-line) bg-(--ws-surface) shadow-none">
      <QueueSection>
        <QueueSectionTrigger className="bg-transparent px-2 text-(--ws-muted) hover:bg-(--ws-hover)">
          <QueueSectionLabel
            count={queue.length}
            label={queue.length === 1 ? 'message queued' : 'messages queued'}
            icon={<ListOrdered className="size-4 text-(--ws-accent)" />}
          />
          <span className="text-xs">Sends after the current reply</span>
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {queue.map((item) => (
              <QueueItem key={item.id} className="hover:bg-(--ws-hover)">
                <div className="flex items-start gap-3">
                  <QueueItemIndicator className="mt-1.5 border-(--ws-accent)" />
                  <QueueItemContent className="text-(--ws-text)">
                    {item.text || 'Attachments only'}
                  </QueueItemContent>
                  <QueueItemActions>
                    <QueueItemAction
                      className="opacity-100 focus-visible:opacity-100 sm:opacity-0"
                      aria-label="Remove from queue"
                      onClick={() => onRemove(item.id)}
                    >
                      <X className="size-3.5" />
                    </QueueItemAction>
                  </QueueItemActions>
                </div>
                {item.files.length > 0 && (
                  <QueueItemAttachment className="ml-6">
                    {item.files.map((file, index) => (
                      <QueueItemFile key={`${file.filename}-${index}`}>
                        {file.filename || 'Attachment'}
                      </QueueItemFile>
                    ))}
                  </QueueItemAttachment>
                )}
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  )
}
