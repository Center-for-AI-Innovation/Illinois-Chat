import React from 'react'
import { Button } from '@/components/shadcn/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { IconAlertTriangleFilled } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { XIcon } from 'lucide-react'

interface CountryOfConcernModalProps {
  opened: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  confirmLabel: string
  children: React.ReactNode
}

/**
 * Confirmation modal shown before an admin enables a country-of-concern model
 * or sets one as the chatbot default.
 *
 * Styling lives here so the two entry points cannot drift: modal chrome uses
 * the --modal* tokens (as in LinkGeneratorModal), copy uses Montserrat, the
 * warning icon uses --illinois-orange, and the confirm button uses the
 * --dashboard-button pair.
 */
export function CountryOfConcernModal({
  opened,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  children,
}: CountryOfConcernModalProps) {
  return (
    <Dialog open={opened} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-md border border-(--modal-border) bg-(--modal) p-0 text-(--modal-text)"
      >
        <div className="mb-4 flex items-center justify-between border-b border-(--modal-border) bg-(--modal) px-6 py-5">
          <DialogTitle
            className={`text-lg font-bold ${montserrat_heading.variable} font-montserratHeading text-(--modal-text)`}
          >
            {title}
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            className="modal-close-button-common mt-1 rounded p-1"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="flex items-start gap-2">
            <IconAlertTriangleFilled
              size="1.5rem"
              style={{
                marginTop: 2,
                flexShrink: 0,
                color: 'var(--illinois-orange)',
              }}
              aria-hidden="true"
            />
            <p
              className={`text-sm ${montserrat_paragraph.variable} font-montserratParagraph`}
              style={{ lineHeight: 1.5, color: 'var(--modal-text)' }}
            >
              {children}
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className={`rounded-md border-(--modal-border) font-semibold text-(--modal-text) hover:bg-(--background-faded) ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              className={`rounded-md bg-(--dashboard-button) font-semibold text-(--dashboard-button-foreground) transition-all duration-200 hover:bg-(--dashboard-button-hover) ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
