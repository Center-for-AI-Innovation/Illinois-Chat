// Maintenance mode. Fields live in the shared PlatformSettingsForm; the
// confirmation dialog and the recovery note live here.

import { Construction } from 'lucide-react'
import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/shadcn/ui/form'
import { Input } from '~/components/shadcn/ui/input'
import { Switch } from '~/components/shadcn/ui/switch'
import { Textarea } from '~/components/shadcn/ui/textarea'
import type { PlatformSettings } from '~/utils/platformSettings.schema'
import { AdminCard } from './AdminCard'

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
        icon={<Construction className="h-5 w-5" aria-hidden="true" />}
        tone={isEnabled ? 'alert' : 'default'}
        headerAside={
          <FormField
            control={form.control}
            name="maintenance.enabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0">
                <FormLabel
                  className={`cursor-pointer text-sm ${
                    field.value
                      ? 'font-semibold text-[--illinois-orange]'
                      : 'text-[--illinois-storm-dark] dark:text-[#c8d2e3]'
                  }`}
                >
                  {field.value ? 'On' : 'Off'}
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={handleToggle}
                    aria-label="Enable maintenance mode"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <p className="rounded-[8px] bg-[--background-faded] px-4 py-3 text-sm text-[--illinois-storm-dark] dark:bg-[#0c1f3f] dark:text-[#c8d2e3]">
            Sign-in and this page stay reachable while maintenance is on, so you
            can always turn it back off. Open tabs keep working until they
            navigate or refetch.
          </p>

          <FormField
            control={form.control}
            name="maintenance.titleText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notice title</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Illinois Chat is down for maintenance"
                    className="rounded-[8px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maintenance.bodyText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notice body</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="We expect to be back by 12:00 PM CT. Thanks for your patience."
                    className="resize-y rounded-[8px]"
                  />
                </FormControl>
                <FormDescription>
                  Shown on the maintenance page. Saved even while maintenance is
                  off, so the copy is ready before you need it.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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
              onClick={() =>
                form.setValue('maintenance.enabled', true, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              Turn on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
