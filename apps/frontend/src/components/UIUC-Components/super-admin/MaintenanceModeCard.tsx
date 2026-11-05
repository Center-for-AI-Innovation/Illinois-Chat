// Maintenance mode. Fields live in the shared PlatformSettingsForm; the
// confirmation dialog and the recovery note live here.

import { cva } from 'class-variance-authority'
import { Construction, Info } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Alert, AlertDescription } from '~/components/shadcn/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/shadcn/ui/alert-dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '~/components/shadcn/ui/field'
import { Input } from '~/components/shadcn/ui/input'
import { Switch } from '~/components/shadcn/ui/switch'
import { Textarea } from '~/components/shadcn/ui/textarea'
import type { PlatformSettings } from '~/utils/platformSettings.schema'
import { AdminCard, adminInsetClass, adminMutedTextClass } from './AdminCard'

const stateLabelVariants = cva('text-sm font-medium', {
  variants: {
    enabled: {
      true: 'font-semibold text-(--illinois-orange)',
      false: adminMutedTextClass,
    },
  },
})

export function MaintenanceModeCard() {
  const form = useFormContext<PlatformSettings>()
  const maintenance = useWatch({ control: form.control, name: 'maintenance' })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isEnabled = maintenance?.enabled === true

  // Turning it *on* is the destructive direction, so that is the only one
  // gated. Turning it off is recovery and must never be obstructed.
  function handleToggle(next: boolean) {
    if (next) {
      setConfirmOpen(true)
      return
    }
    form.setValue('maintenance.enabled', false, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <>
      <AdminCard
        title="Maintenance mode"
        blastRadius="Replaces every page with a maintenance notice for all visitors, on their next page load."
        icon={<Construction className="size-5" aria-hidden="true" />}
        tone={isEnabled ? 'alert' : 'default'}
        headerAside={
          <Controller
            control={form.control}
            name="maintenance.enabled"
            render={({ field }) => (
              <Field orientation="horizontal" className="w-auto gap-2.5">
                <span
                  aria-hidden="true"
                  className={stateLabelVariants({ enabled: field.value })}
                >
                  {field.value ? 'On' : 'Off'}
                </span>
                <Switch
                  variant="labeled"
                  size="sm"
                  checked={field.value}
                  onCheckedChange={handleToggle}
                  aria-label="Enable maintenance mode"
                />
              </Field>
            )}
          />
        }
      >
        <FieldGroup className="gap-5">
          <Alert
            role="note"
            className={`${adminInsetClass} border-0 ${adminMutedTextClass}`}
          >
            <Info aria-hidden="true" />
            <AlertDescription className="text-current">
              Sign-in and this page stay reachable while maintenance is on, so
              you can always turn it back off. Open tabs keep working until
              they navigate or refetch.
            </AlertDescription>
          </Alert>

          <Controller
            control={form.control}
            name="maintenance.titleText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="maintenance-title">Notice title</FieldLabel>
                <Input
                  {...field}
                  id="maintenance-title"
                  placeholder="Illinois Chat is down for maintenance"
                  aria-invalid={fieldState.invalid || undefined}
                  className="rounded-[8px]"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="maintenance.bodyText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="maintenance-body">Notice body</FieldLabel>
                <Textarea
                  {...field}
                  id="maintenance-body"
                  rows={3}
                  placeholder="We expect to be back by 12:00 PM CT. Thanks for your patience."
                  aria-invalid={fieldState.invalid || undefined}
                  className="resize-y rounded-[8px]"
                />
                <FieldDescription>
                  Shown on the maintenance page. Saved even while maintenance is
                  off, so the copy is ready before you need it.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>
      </AdminCard>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on maintenance mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Every visitor sees the maintenance notice instead of Illinois Chat
              from their next page load. Sign-in and this admin page stay
              reachable, so you can turn it back off. Nothing changes until you
              save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                form.setValue('maintenance.enabled', true, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
                setConfirmOpen(false)
              }}
            >
              Turn on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
