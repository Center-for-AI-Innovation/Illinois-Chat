// The orange announcement bar on the home page. Fields live in the shared
// PlatformSettingsForm, so this card is presentation plus the live preview.

import { Megaphone } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Input } from '~/components/shadcn/ui/input'
import { Switch } from '~/components/shadcn/ui/switch'
import { Textarea } from '~/components/shadcn/ui/textarea'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/shadcn/ui/form'
import {
  ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
  type PlatformSettings,
} from '~/utils/platformSettings.schema'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import { AdminCard } from './AdminCard'

export function AnnouncementBannerCard() {
  const form = useFormContext<PlatformSettings>()
  const banner = useWatch({
    control: form.control,
    name: 'announcementBanner',
  })

  const messageLength = banner?.message?.length ?? 0

  return (
    <AdminCard
      title="Announcement banner"
      blastRadius="Shows to everyone on the home page. Takes up to 30 seconds to appear after saving."
      icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
      headerAside={
        <FormField
          control={form.control}
          name="announcementBanner.enabled"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3 space-y-0">
              <FormLabel className="cursor-pointer text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                {field.value ? 'Shown' : 'Hidden'}
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Show the announcement banner"
                />
              </FormControl>
            </FormItem>
          )}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <FormField
          control={form.control}
          name="announcementBanner.message"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-baseline justify-between gap-3">
                <FormLabel>Message</FormLabel>
                <span
                  className={`text-xs ${
                    messageLength > ANNOUNCEMENT_MESSAGE_MAX_LENGTH
                      ? 'text-destructive'
                      : 'text-[--illinois-storm-medium] dark:text-[#94a3b8]'
                  }`}
                >
                  {messageLength}/{ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  placeholder="Illinois Chat will be unavailable Saturday 8am–noon for maintenance."
                  className="resize-y rounded-[8px]"
                />
              </FormControl>
              <FormDescription>
                Rendered as plain text. HTML is not interpreted.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="announcementBanner.linkText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link text</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Read the status page"
                    className="rounded-[8px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="announcementBanner.linkUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link URL</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="url"
                    placeholder="https://status.illinois.edu"
                    className="rounded-[8px]"
                  />
                </FormControl>
                <FormDescription>
                  Must be https. Leave both link fields blank for no link.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[--illinois-blue] dark:text-white">
            Preview
          </p>
          <div className="overflow-hidden rounded-[8px] border border-[#e5e7eb] dark:border-[#32517a]">
            {banner?.enabled && banner.message ? (
              // The real component, not a mock-up: the preview is the shipping
              // renderer fed the current form values, so an operator cannot be
              // shown something that differs from what visitors get.
              <AnnouncementBanner
                preview
                banner={{
                  enabled: true,
                  message: banner.message,
                  linkText: banner.linkText ?? '',
                  linkUrl: banner.linkUrl ?? '',
                }}
              />
            ) : (
              <p className="bg-[--background-faded] px-4 py-3 text-sm text-[--illinois-storm-medium] dark:bg-[#0c1f3f] dark:text-[#94a3b8]">
                {banner?.enabled
                  ? 'Add a message to preview the banner.'
                  : 'Hidden — the home page shows no announcement bar.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </AdminCard>
  )
}
