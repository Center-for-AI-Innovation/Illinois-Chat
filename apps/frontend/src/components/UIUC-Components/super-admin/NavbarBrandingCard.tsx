// The logo and two-word name in the navbar on every page. Fields live in the
// shared PlatformSettingsForm; this card adds the logo picker and live preview.

import { ImageUp, PanelTop, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Button } from '~/components/shadcn/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '~/components/shadcn/ui/field'
import { Input } from '~/components/shadcn/ui/input'
import { NavbarBrand } from '~/components/UIUC-Components/navbars/NavbarBrand'
import {
  DEFAULT_NAVBAR_BRANDING,
  DEFAULT_NAVBAR_BRANDING_SETTINGS,
  DEFAULT_NAVBAR_LOGO_SRC,
  NAVBAR_LOGO_MAX_BYTES,
  NAVBAR_LOGO_MIME_TYPES,
  NAVBAR_WORD_MAX_LENGTH,
  type PlatformSettings,
} from '~/utils/platformSettings.schema'
import { AdminCard, adminInsetClass } from './AdminCard'

const LOGO_MAX_KB = NAVBAR_LOGO_MAX_BYTES / 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function NavbarBrandingCard() {
  const form = useFormContext<PlatformSettings>()
  const branding = useWatch({ control: form.control, name: 'navbarBranding' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  function setLogo(value: string) {
    form.setValue('navbarBranding.logoDataUrl', value, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  // Checked here as well as in the schema so an oversized file is rejected
  // before it is base64-encoded into the form.
  async function handleFile(file: File | undefined) {
    setFileError(null)
    if (!file) return
    if (!(NAVBAR_LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setFileError('Choose a PNG, JPG, WebP, GIF, or SVG image.')
      return
    }
    if (file.size > NAVBAR_LOGO_MAX_BYTES) {
      setFileError(`That file is over ${LOGO_MAX_KB} KB.`)
      return
    }
    try {
      setLogo(await readAsDataUrl(file))
    } catch {
      setFileError('That file could not be read.')
    }
  }

  function resetToDefaults() {
    setFileError(null)
    form.setValue('navbarBranding', DEFAULT_NAVBAR_BRANDING_SETTINGS, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const logoSrc = branding?.logoDataUrl || DEFAULT_NAVBAR_LOGO_SRC
  const isDefaultLogo = !branding?.logoDataUrl
  const isAllDefault =
    isDefaultLogo &&
    branding?.primaryWord?.trim() === DEFAULT_NAVBAR_BRANDING.primaryWord &&
    branding?.secondaryWord?.trim() === DEFAULT_NAVBAR_BRANDING.secondaryWord

  return (
    <AdminCard
      title="Navbar branding"
      blastRadius="The logo and name in the navbar on every page. Colours stay orange and blue; only the words and logo change."
      icon={<PanelTop className="size-5" aria-hidden="true" />}
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <FieldGroup className="gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="navbarBranding.primaryWord"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="navbar-primary-word">
                    First word
                  </FieldLabel>
                  <Input
                    {...field}
                    id="navbar-primary-word"
                    maxLength={NAVBAR_WORD_MAX_LENGTH}
                    placeholder={DEFAULT_NAVBAR_BRANDING.primaryWord}
                    aria-invalid={fieldState.invalid || undefined}
                    className="rounded-[8px]"
                  />
                  <FieldDescription>Shown in orange.</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="navbarBranding.secondaryWord"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="navbar-secondary-word">
                    Second word
                  </FieldLabel>
                  <Input
                    {...field}
                    id="navbar-secondary-word"
                    maxLength={NAVBAR_WORD_MAX_LENGTH}
                    placeholder={DEFAULT_NAVBAR_BRANDING.secondaryWord}
                    aria-invalid={fieldState.invalid || undefined}
                    className="rounded-[8px]"
                  />
                  <FieldDescription>Shown in blue (white in dark mode).</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>

          <Controller
            control={form.control}
            name="navbarBranding.logoDataUrl"
            render={({ fieldState }) => (
              <Field data-invalid={fieldState.invalid || fileError ? true : undefined}>
                <FieldTitle>Logo</FieldTitle>
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`${adminInsetClass} flex size-16 shrink-0 items-center justify-center p-2`}
                  >
                    <img
                      src={logoSrc}
                      alt={isDefaultLogo ? 'Default logo' : 'Uploaded logo'}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={NAVBAR_LOGO_MIME_TYPES.join(',')}
                    className="hidden"
                    aria-label="Upload navbar logo"
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[8px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageUp aria-hidden="true" />
                    {isDefaultLogo ? 'Upload logo' : 'Replace logo'}
                  </Button>
                </div>
                <FieldDescription>
                  PNG, JPG, WebP, GIF, or SVG up to {LOGO_MAX_KB} KB. Shown 40px
                  tall; square or wide marks work best.
                </FieldDescription>
                <FieldError
                  errors={[
                    fileError ? { message: fileError } : fieldState.error,
                  ]}
                />
              </Field>
            )}
          />
        </FieldGroup>

        <Field>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <FieldTitle>Preview</FieldTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-[8px]"
              disabled={isAllDefault}
              onClick={resetToDefaults}
            >
              <RotateCcw aria-hidden="true" />
              Reset to defaults
            </Button>
          </div>
          {/* The shipping brand component on the navbar's own surface, so the
              preview cannot drift from what visitors see. */}
          <div
            inert
            className="flex h-20 items-center overflow-hidden rounded-[8px] border-b border-(--navbar-border) bg-(--navbar-background) px-4 ring-1 ring-[#e5e7eb] dark:ring-[#32517a]"
          >
            <NavbarBrand
              primaryWord={
                branding?.primaryWord || DEFAULT_NAVBAR_BRANDING.primaryWord
              }
              secondaryWord={
                branding?.secondaryWord || DEFAULT_NAVBAR_BRANDING.secondaryWord
              }
              logoSrc={logoSrc}
            />
          </div>
        </Field>
      </div>
    </AdminCard>
  )
}
