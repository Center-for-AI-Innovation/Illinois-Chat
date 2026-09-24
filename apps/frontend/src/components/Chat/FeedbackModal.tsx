import React, { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/shadcn/ui/dialog'
import { Button } from '@/components/shadcn/ui/button'
import { Textarea } from '@/components/shadcn/ui/textarea'
import { Spinner } from '@/components/shadcn/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select'

const FEEDBACK_CATEGORIES = [
  { value: 'inaccurate', label: 'Not factually correct' },
  { value: 'inappropriate', label: 'Harmful content' },
  { value: 'unclear', label: 'Unclear Response' },
  { value: 'ui_bug', label: 'UI bug' },
  { value: 'overactive_refusal', label: 'Overactive refusal' },
  {
    value: 'incomplete_request',
    label: 'Did not fully follow my request',
  },
  { value: 'other', label: 'Other' },
]

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (feedback: string, category: string) => void
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [feedback, setFeedback] = useState<string>('')
  const [category, setCategory] = useState<string>('other')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(feedback, category)
      setFeedback('')
      setCategory('other')
      onClose()
    } catch (error) {
      console.error('Feedback submission failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-4 bg-(--modal) text-(--modal-text)"
      >
        <DialogTitle className="mb-0 text-xl font-bold text-(--modal-text)">
          Feedback
        </DialogTitle>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-(--modal-text)">
            Feedback Category
          </label>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value || 'other')}
          >
            <SelectTrigger
              aria-label="Feedback category select"
              className="w-full border-(--modal-border) bg-(--modal-dark) text-(--modal-text) focus-visible:border-(--background-darker)"
            >
              <SelectValue placeholder="Select a category">
                {(value: string | null) =>
                  FEEDBACK_CATEGORIES.find((option) => option.value === value)
                    ?.label ?? 'Select a category'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[250px] border-(--modal-border) bg-(--modal-dark) text-(--modal-text)">
              {FEEDBACK_CATEGORIES.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="data-highlighted:bg-(--dashboard-button) data-highlighted:text-(--dashboard-button-foreground)"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-(--modal-text)">Feedback Details</span>
            <span className="text-sm text-(--foreground-faded)">
              (Optional)
            </span>
          </div>
          <Textarea
            placeholder="Share any additional details about your feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.currentTarget.value)}
            rows={4}
            aria-label="Optional feedback details textarea"
            className="text-(--modal-text) placeholder:text-(--foreground-faded) border-(--modal-border) bg-(--background-faded) focus-visible:border-(--background-darker)"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={onClose}
            variant="outline"
            aria-label="Cancel"
            className="border border-(--background-faded) bg-transparent text-(--foreground-faded) hover:bg-(--background-faded) hover:text-(--foreground)"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            aria-label="Submit Feedback"
            className="bg-(--dashboard-button) text-(--dashboard-button-foreground) transition-colors duration-200 hover:bg-(--dashboard-button-hover) disabled:bg-(--background-faded) disabled:text-(--foreground-faded) disabled:opacity-60"
          >
            {isSubmitting && <Spinner className="size-4" />}
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
