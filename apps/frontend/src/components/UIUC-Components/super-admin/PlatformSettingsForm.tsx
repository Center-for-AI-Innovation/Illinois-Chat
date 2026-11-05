// One form for banner and maintenance settings. Saves include only edited
// sections and the version of the snapshot loaded into the form.

import { zodResolver } from '@hookform/resolvers/zod'
import { cva } from 'class-variance-authority'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Button } from '~/components/shadcn/ui/button'
import { useFetchPlatformSettings } from '~/hooks/queries/useFetchPlatformSettings'
import {
  PlatformSettingsConflictError,
  useUpdatePlatformSettings,
} from '~/hooks/queries/useUpdatePlatformSettings'
import {
  platformSettingsSchema,
  type PlatformSettings,
  type PlatformSettingsUpdate,
} from '~/utils/platformSettings.schema'
import { showErrorToast, showSuccessToast } from '~/utils/toastUtils'
import {
  AdminCardSkeleton,
  AdminInlineError,
  AdminInlineWarning,
  adminMutedTextClass,
} from './AdminCard'
import { AnnouncementBannerCard } from './AnnouncementBannerCard'
import { MaintenanceModeCard } from './MaintenanceModeCard'

// Floats only while there is something to save, so on small screens it does
// not permanently cover a slice of the form.
const saveBarVariants = cva(
  'z-10 flex flex-col gap-3 rounded-[14px] bg-white/95 p-4 ring-1 ring-[#e5e7eb] backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:bg-[#13294b]/95 dark:ring-[#32517a]',
  {
    variants: {
      floating: {
        true: 'sticky bottom-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]',
        false: 'shadow-[0_4px_20px_rgba(0,0,0,0.06)]',
      },
    },
  },
)

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
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null)
  const [hasConflict, setHasConflict] = useState(false)
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
  // Only an unreachable store blocks editing. A malformed banner record must
  // stay editable, since overwriting it from here is the recovery path.
  const isUnreadable = data?.bannerState === 'unavailable'

  // Seed the form once the server value lands. Guarded on `isDirty` so a
  // background refetch cannot overwrite what an operator is typing.
  useEffect(() => {
    if (data && data.bannerState !== 'unavailable' && !form.formState.isDirty) {
      form.reset(data.settings)
      setLoadedVersion(data.version)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  async function onSubmit(values: PlatformSettings) {
    if (isUnreadable || loadedVersion === null || hasConflict) return
    setSaveError(null)
    setSaveStatus(null)
    const changes: PlatformSettingsUpdate = { version: loadedVersion }
    if (form.formState.dirtyFields.announcementBanner)
      changes.announcementBanner = values.announcementBanner
    if (form.formState.dirtyFields.maintenance)
      changes.maintenance = values.maintenance
    try {
      const result = await updateSettings.mutateAsync(changes)
      setLoadedVersion(result.version)
      // Clearing dirty from the submitted values, not from a refetch, so the
      // form does not flicker back to stale content.
      form.reset(values)
      if (result.revalidated) {
        setSaveStatus(
          'Saved. New page loads show it now; open tabs update within a minute.',
        )
        showSuccessToast('Platform settings saved', 'Saved')
      } else {
        // A durable save whose on-demand page regeneration did not land. Not a
        // failure: the home page is statically regenerated every 30 seconds.
        setSaveStatus(
          'Saved. Open tabs update within a minute; fresh home page loads within 30 seconds.',
        )
        showSuccessToast(
          'Saved. Open tabs update within a minute.',
          'Saved',
        )
      }
    } catch (err) {
      if (err instanceof PlatformSettingsConflictError) setHasConflict(true)
      const message = err instanceof Error ? err.message : 'Unknown error'
      setSaveError(message)
      showErrorToast(message, 'Could not save settings')
    }
  }

  async function reloadLatest() {
    const result = await refetch()
    if (result.isError || !result.data) return
    if (result.data.bannerState === 'unavailable') return
    form.reset(result.data.settings)
    setLoadedVersion(result.data.version)
    setHasConflict(false)
    setSaveError(null)
    setSaveStatus('Latest settings loaded. Reapply your changes before saving.')
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

  if (isUnreadable) {
    return (
      <AdminInlineError
        title="Could not load platform settings"
        message={data?.warning ?? 'The settings store is unreachable.'}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    )
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        {data?.bannerState === 'invalid' && (
          <AdminInlineWarning message="The stored banner could not be read, so the announcement fields below are blank rather than showing the saved value. Editing and saving the announcement section overwrites the stored record; saving maintenance alone leaves it as is." />
        )}
        {data?.bannerState === 'absent' && (
          <AdminInlineWarning message="The home page uses its default banner, if configured. Editing and saving the announcement section replaces that banner; saving maintenance alone keeps it." />
        )}
        {hasConflict && (
          <Button
            type="button"
            variant="outline"
            disabled={isFetching}
            onClick={() => void reloadLatest()}
          >
            Reload latest settings and discard my edits
          </Button>
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

        <div
          className={saveBarVariants({
            floating: isDirty || updateSettings.isPending,
          })}
        >
          <div className="min-w-0 text-sm">
            {/* Announced to assistive tech; also the visible save receipt. */}
            <p aria-live="polite" className="flex min-w-0 items-center gap-2">
              {isDirty ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-(--illinois-orange)"
                  />
                  <span className="font-semibold text-(--illinois-orange)">
                    Unsaved changes
                  </span>
                </>
              ) : (
                <span className={adminMutedTextClass}>
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
          <div className="flex shrink-0 items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                // After a conflict the cached snapshot is stale; resetting to
                // it would only produce another conflict on the next save.
                if (hasConflict) {
                  void reloadLatest()
                  return
                }
                form.reset(data?.settings)
                setLoadedVersion(data?.version ?? null)
                setSaveError(null)
                setSaveStatus(null)
              }}
              disabled={!isDirty || updateSettings.isPending || isFetching}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="dashboard"
              className="flex-1 sm:flex-none"
              disabled={
                !isDirty ||
                updateSettings.isPending ||
                isUnreadable ||
                loadedVersion === null ||
                hasConflict
              }
            >
              {updateSettings.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {updateSettings.isPending ? 'Saving' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
