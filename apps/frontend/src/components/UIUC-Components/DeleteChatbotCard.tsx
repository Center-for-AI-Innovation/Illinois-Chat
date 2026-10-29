import { Button } from '@/components/shadcn/ui/button'
import { Card } from '@/components/shadcn/ui/card'
import { Checkbox } from '@/components/shadcn/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { useRouter } from 'next/router'
import { useId, useState } from 'react'
import {
  useDeleteChatbot,
  useFetchChatbotDeletionInfo,
} from '~/hooks/queries/useChatbotDeletion'
import type { ExternalStoreKind } from '~/types/chatbotDeletion'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { showToast } from '~/utils/toastUtils'

const STORE_LABELS: Record<ExternalStoreKind, string> = {
  database: 'database',
  qdrant: 'Qdrant vector store',
  s3: 'S3 bucket',
}

function DeleteChatbotCard({
  course_name,
  sidebarCollapsed = false,
}: {
  course_name: string
  sidebarCollapsed?: boolean
}) {
  const router = useRouter()
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed)
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [includeExternal, setIncludeExternal] = useState(false)
  const confirmId = useId()
  const externalId = useId()

  const { data: info } = useFetchChatbotDeletionInfo({
    courseName: course_name,
    enabled: open,
  })
  const deleteChatbot = useDeleteChatbot()
  const externalStores = info?.external_stores ?? []

  const closeDialog = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setConfirmName('')
      setIncludeExternal(false)
    }
  }

  const handleDelete = async () => {
    try {
      const { queued } = await deleteChatbot.mutateAsync({
        courseName: course_name,
        confirmName,
        includeExternal: includeExternal && externalStores.length > 0,
      })
      showToast({
        type: queued ? 'success' : 'warning',
        title: `${course_name} deleted`,
        message: queued
          ? 'The chatbot is gone. Its files and history are being removed in the background.'
          : 'The chatbot is gone, but its cleanup could not be scheduled yet. A super admin can retry it.',
      })
      closeDialog(false)
      await router.push('/chatbots')
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Could not delete chatbot',
        message: (error as Error).message,
      })
    }
  }

  return (
    <Card
      className={`mt-[2%] mb-[2%] ${cardWidthClasses} gap-0 rounded-4xl border py-0 text-base shadow-none ring-0`}
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--dashboard-border)',
      }}
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8">
        <div>
          <h3
            className={`${montserrat_heading.variable} font-montserratHeading text-lg font-bold text-(--foreground) sm:text-2xl`}
          >
            Delete chatbot
          </h3>
          <p
            className={`${montserrat_paragraph.variable} font-montserratParagraph text-sm text-(--foreground-faded)`}
          >
            Permanently removes this chatbot, its documents, and its
            conversation history. This cannot be undone.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          className="shrink-0 rounded-md"
          onClick={() => setOpen(true)}
        >
          Delete chatbot
        </Button>
      </div>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {course_name}?</DialogTitle>
            <DialogDescription>
              The chatbot disappears right away. Its documents, embeddings,
              conversations and uploaded files are then removed in the
              background, which can take a while for large chatbots. The name
              becomes available again once that finishes.
            </DialogDescription>
          </DialogHeader>

          {externalStores.length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-(--dashboard-border) p-3">
              <Checkbox
                id={externalId}
                checked={includeExternal}
                onCheckedChange={(checked) => setIncludeExternal(checked)}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={externalId}>
                  Also delete this chatbot&apos;s data in its external storage
                </Label>
                <p className="text-xs text-(--foreground-faded)">
                  This chatbot is connected to its own{' '}
                  {externalStores.map((k) => STORE_LABELS[k]).join(', ')}. Leave
                  this unchecked to keep that data where it is; only data hosted
                  by Illinois Chat is deleted.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={confirmId}>
              Type <span className="font-mono">{course_name}</span> to confirm
            </Label>
            <Input
              id={confirmId}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-md"
              onClick={() => closeDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-md"
              disabled={confirmName !== course_name || deleteChatbot.isPending}
              onClick={handleDelete}
            >
              {deleteChatbot.isPending ? 'Deleting…' : 'Delete chatbot'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default DeleteChatbotCard
