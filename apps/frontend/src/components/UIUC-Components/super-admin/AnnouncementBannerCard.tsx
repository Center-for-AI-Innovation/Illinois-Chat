// The orange announcement bar on the home page. Fields live in the shared
// PlatformSettingsForm, so this card is presentation plus the live preview.

import { cva } from 'class-variance-authority'
import { Megaphone } from 'lucide-react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '~/components/shadcn/ui/field'
import { Input } from '~/components/shadcn/ui/input'
import { Switch } from '~/components/shadcn/ui/switch'
import { Textarea } from '~/components/shadcn/ui/textarea'
import { AnnouncementBanner } from '~/components/UIUC-Components/AnnouncementBanner'
import {
  ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
  type PlatformSettings,
} from '~/utils/platformSettings.schema'
import {
  AdminCard,
  adminInsetClass,
  adminMutedTextClass,
  adminSubtleTextClass,
} from './AdminCard'

const counterVariants = cva('text-xs tabular-nums', {
  variants: {
    over: {
      true: 'text-destructive font-medium',
      false: adminSubtleTextClass,
    },
  },
})

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
      icon={<Megaphone className="size-5" aria-hidden="true" />}
      headerAside={
        <Controller
          control={form.control}
          name="announcementBanner.enabled"
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto gap-2.5">
              <span
                aria-hidden="true"
                className={`text-sm font-medium ${adminMutedTextClass}`}
              >
                {field.value ? 'Shown' : 'Hidden'}
              </span>
              <Switch
                variant="labeled"
                size="sm"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Show the announcement banner"
              />
            </Field>
          )}
        />
      }
    >
      <FieldGroup className="gap-5">
        <Controller
          control={form.control}
          name="announcementBanner.message"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor="announcement-message">Message</FieldLabel>
                <span
                  className={counterVariants({
                    over: messageLength > ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
                  })}
                >
                  {messageLength}/{ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                {...field}
                id="announcement-message"
                rows={3}
                placeholder="Illinois Chat will be unavailable Saturday 8am–noon for maintenance."
                aria-invalid={fieldState.invalid || undefined}
                className="resize-y rounded-[8px]"
              />
              <FieldDescription>
                Rendered as plain text. HTML is not interpreted.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="announcementBanner.linkText"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="announcement-link-text">
                  Link text
                </FieldLabel>
                <Input
                  {...field}
                  id="announcement-link-text"
                  placeholder="Read the status page"
                  aria-invalid={fieldState.invalid || undefined}
                  className="rounded-[8px]"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="announcementBanner.linkUrl"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="announcement-link-url">
                  Link URL
                </FieldLabel>
                <Input
                  {...field}
                  id="announcement-link-url"
                  inputMode="url"
                  placeholder="https://status.illinois.edu"
                  aria-invalid={fieldState.invalid || undefined}
                  className="rounded-[8px]"
                />
                <FieldDescription>
                  Must be https. Leave both link fields blank for no link.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <Field>
          <FieldTitle>Preview</FieldTitle>
          {/* Inert so clicking the preview link cannot navigate away from unsaved edits. */}
          <div
            inert
            className="overflow-hidden rounded-[8px] ring-1 ring-[#e5e7eb] dark:ring-[#32517a]"
          >
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
              <p
                className={`${adminInsetClass} rounded-none px-4 py-3 text-sm ${adminSubtleTextClass}`}
              >
                {banner?.enabled
                  ? 'Add a message to preview the banner.'
                  : 'Hidden — the home page shows no announcement bar.'}
              </p>
            )}
          </div>
        </Field>
      </FieldGroup>
    </AdminCard>
  )
}
