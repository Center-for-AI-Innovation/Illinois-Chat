'use client'
import { useState } from 'react'
import { cn } from '@/components/shadcn/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { fillButton, workspaceTheme } from './theme'

const CATEGORIES = [
  { value: 'inaccurate', label: 'Not factually correct' },
  { value: 'incomplete_request', label: 'Did not follow my request' },
  { value: 'unclear', label: 'Unclear response' },
  { value: 'overactive_refusal', label: 'Overactive refusal' },
  { value: 'inappropriate', label: 'Harmful content' },
  { value: 'ui_bug', label: 'UI bug' },
  { value: 'other', label: 'Other' },
] as const

export function FeedbackDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (category: string, details: string) => void
}) {
  const [category, setCategory] = useState<string>('other')
  const [details, setDetails] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          workspaceTheme,
          'gap-0 overflow-hidden rounded-2xl border-0 bg-(--ws-surface) p-0 text-(--ws-text) shadow-xl ring-0 sm:max-w-md',
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(category, details.trim())
            setCategory('other')
            setDetails('')
          }}
        >
          <div className="space-y-1 px-5 pt-5 pb-4">
            <DialogTitle className="font-wsDisplay text-lg font-semibold text-(--ws-heading)">
              What went wrong?
            </DialogTitle>
            <DialogDescription className="text-sm text-(--ws-muted)">
              Your feedback helps the course team improve this assistant.
            </DialogDescription>
          </div>
          <fieldset className="px-5">
            <legend className="sr-only">Feedback category</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--ws-orange)',
                    category === option.value
                      ? 'bg-(--ws-blue) text-white dark:bg-(--ws-orange) dark:text-(--ws-blue)'
                      : 'bg-(--ws-fill) text-(--ws-text) hover:bg-(--ws-fill-hover)',
                  )}
                >
                  <input
                    type="radio"
                    name="feedback-category"
                    value={option.value}
                    checked={category === option.value}
                    onChange={() => setCategory(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block px-5 pt-5">
            <span className="text-sm font-medium text-(--ws-heading)">
              Details{' '}
              <span className="font-normal text-(--ws-muted)">(optional)</span>
            </span>
            <span
              data-ws-field
              className="mt-2 block rounded-xl border border-(--ws-input) bg-(--ws-surface) transition-[border-color,box-shadow]"
            >
              <textarea
                rows={4}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="What should the answer have said?"
                className="block w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-sm leading-6 text-(--ws-text) outline-none placeholder:text-(--ws-muted)"
              />
            </span>
          </label>
          <div className="mt-5 flex justify-end gap-2 bg-(--ws-sidebar) px-5 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(fillButton, 'h-9 px-4 text-sm')}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-(--ws-blue) px-4 text-sm font-semibold text-white shadow-(--ws-elevation) outline-offset-2 transition-opacity hover:opacity-90 dark:bg-(--ws-orange) dark:text-(--ws-blue)"
            >
              Send feedback
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
