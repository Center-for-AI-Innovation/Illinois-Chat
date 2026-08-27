import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { toast } from 'sonner'

import { Toaster } from '@/components/shadcn/ui/sonner'
import { showToast, showErrorToast } from '../toastUtils'

// End-to-end: uses the REAL sonner (not mocked) to prove the migrated toastUtils
// actually renders a visible toast through the shadcn <Toaster>.

afterEach(() => {
  toast.dismiss()
  cleanup()
})

describe('toastUtils + sonner Toaster (integration)', () => {
  it('renders a toast heading + description through the real Toaster', async () => {
    render(<Toaster />)

    showToast({
      title: 'Saved',
      message: 'Your changes were saved',
      type: 'success',
    })

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(
      await screen.findByText('Your changes were saved'),
    ).toBeInTheDocument()
  })

  it('convenience helper renders the message (no title → message is the heading)', async () => {
    render(<Toaster />)

    showErrorToast('Something failed')

    expect(await screen.findByText('Something failed')).toBeInTheDocument()
  })
})
