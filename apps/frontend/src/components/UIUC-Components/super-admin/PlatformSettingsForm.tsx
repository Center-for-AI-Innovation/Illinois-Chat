// The Platform tab: one form over the banner and maintenance cards.
//
// One form, not two, because `PUT /api/admin/settings` writes the banner field
// and the three maintenance keys in a single Redis MULTI. Giving each card its
// own Save would mean either two endpoints or a button that quietly writes the
// other card's on-screen values too.

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '~/components/shadcn/ui/button'
import { Form } from '~/components/shadcn/ui/form'
import { useFetchPlatformSettings } from '~/hooks/queries/useFetchPlatformSettings'
import { useUpdatePlatformSettings } from '~/hooks/queries/useUpdatePlatformSettings'
import {
  platformSettingsSchema,
  type PlatformSettings,
} from '~/utils/platformSettings.schema'
import { showErrorToast, showSuccessToast } from '~/utils/toastUtils'
import {
  AdminCardSkeleton,
  AdminInlineError,
  AdminInlineWarning,
} from './AdminCard'
import { AnnouncementBannerCard } from './AnnouncementBannerCard'
import { MaintenanceModeCard } from './MaintenanceModeCard'

interface PlatformSettingsFormProps {
  /** Lets the page warn before a tab switch discards edits. */
  onDirtyChange?: (isDirty: boolean) => void
}

export function PlatformSettingsForm({
  onDirtyChange,
}: PlatformSettingsFormProps) {
  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchPlatformSettings()
  const updateSettings = useUpdatePlatformSettings()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const form = useForm<PlatformSettings>({
    resolver: zodResolver(platformSettingsSchema),
    mode: 'onBlur',
    // The real values arrive from the server; this only keeps the inputs
    // controlled through the first render.
    defaultValues: {
      announcementBanner: {
        enabled: false,
        message: '',
        linkText: '',
        linkUrl: '',
      },
      maintenance: { enabled: false, titleText: '', bodyText: '' },
    },
  })

  const isDirty = form.formState.isDirty

  // Seed the form once the server value lands. Guarded on `isDirty` so a
  // background refetch cannot overwrite what an operator is typing.
  useEffect(() => {
    if (data && !form.formState.isDirty) {
      form.reset(data.settings)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  async function onSubmit(values: PlatformSettings) {
    setSaveError(null)
    setSaveStatus(null)
    try {
      const result = await updateSettings.mutateAsync(values)
      // Clearing dirty from the submitted values, not from a refetch, so the
      // form does not flicker back to stale content.
      form.reset(values)
      if (result.revalidated) {
        setSaveStatus('Saved. The home page is already showing the new banner.')
        showSuccessToast('Platform settings saved', 'Saved')
      } else {
        // A durable save whose on-demand page regeneration did not land. Not a
        // failure: the home page is statically regenerated every 30 seconds.
        setSaveStatus(
          'Saved. Home page refresh is pending and will appear within 30 seconds.',
        )
        showSuccessToast(
          'Saved. Home page refresh pending — it appears within 30 seconds.',
          'Saved',
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setSaveError(message)
      showErrorToast(message, 'Could not save settings')
    }
  }

  if (isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminCardSkeleton rows={4} />
        <AdminCardSkeleton rows={3} />
      </div>
    )
  }

  if (isError) {
    return (
      <AdminInlineError
        title="Could not load platform settings"
        message={error instanceof Error ? error.message : 'Unknown error'}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {data?.warning && <AdminInlineWarning message={data.warning} />}
        {data?.bannerState === 'invalid' && (
          <AdminInlineWarning message="The stored banner could not be read, so the fields below are blank rather than showing the saved value. Saving will overwrite the stored record." />
        )}
        {saveError && (
          <AdminInlineError
            title="Could not save settings"
            message={saveError}
          />
        )}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <AnnouncementBannerCard />
          <MaintenanceModeCard />
        </div>

        <div className="sticky bottom-4 flex flex-col gap-3 rounded-[14px] border border-[#e5e7eb] bg-white/95 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-[#32517a] dark:bg-[#13294b]/95 dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            {/* Announced to assistive tech; also the visible save receipt. */}
            <p aria-live="polite" className="min-w-0">
              {isDirty ? (
                <span className="font-semibold text-[--illinois-orange]">
                  Unsaved changes
                </span>
              ) : (
                <span className="text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                  {saveStatus ??
                    (data?.updatedAt
                      ? `Last saved ${new Date(
                          data.updatedAt,
                        ).toLocaleString()}${
                          data.updatedBy ? ` by ${data.updatedBy}` : ''
                        }`
                      : 'No changes')}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset(data?.settings)
                setSaveError(null)
                setSaveStatus(null)
              }}
              disabled={!isDirty || updateSettings.isPending}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="dashboard"
              disabled={!isDirty || updateSettings.isPending}
              className="gap-2"
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {updateSettings.isPending ? 'Saving' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
