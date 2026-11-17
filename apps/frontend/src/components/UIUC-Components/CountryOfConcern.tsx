import React from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { cn } from '@/components/shadcn/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import {
  COUNTRY_OF_CONCERN_INFO_URL,
  COUNTRY_OF_CONCERN_WARNING,
  getCountryOfConcern,
} from '~/utils/modelProviders/countriesOfConcern'

const LINK_TEXT = 'Country of Concern'
const [BEFORE_LINK, AFTER_LINK] = COUNTRY_OF_CONCERN_WARNING.split(LINK_TEXT)

export function DeepSeekDirectiveNotice() {
  return (
    <>
      Be aware that on October 19, 2026 Homeland Security issued a{' '}
      <a
        href="https://public-inspection.federalregister.gov/2026-21447.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        directive
      </a>{' '}
      ordering federal civilian agencies to remove DeepSeek from their systems.
      We are seeking guidance from the university on the implications of this
      for us. We are not yet removing DeepSeek, but that could end up happening
      with little to no advance notice.
    </>
  )
}

/** The shared warning, with "Country of Concern" linking to the guidance PDF. */
export function CountryOfConcernNotice() {
  return (
    <>
      {BEFORE_LINK}
      <a
        href={COUNTRY_OF_CONCERN_INFO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {LINK_TEXT}
      </a>
      {AFTER_LINK}
    </>
  )
}

/** Warning icon with the shared warning as a tooltip; nothing for unflagged models. */
export function CountryOfConcernIcon({
  modelId,
  size = '1rem',
  className,
  onClick,
}: {
  modelId: string | undefined | null
  size?: string | number
  className?: string
  onClick?: React.MouseEventHandler<HTMLSpanElement>
}) {
  const country = getCountryOfConcern(modelId)
  if (!country) return null
  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        render={
          <span
            aria-label={`Country of concern warning: ${country}`}
            className={cn('inline-flex items-center', className)}
            onClick={onClick}
          />
        }
      >
        <IconAlertTriangle
          size={size}
          stroke={2}
          aria-hidden="true"
          className="text-yellow-500"
        />
      </TooltipTrigger>
      {/* Plain text: tooltip clicks bubble to the trigger's parent, so no link. */}
      <TooltipContent className="max-w-[280px] text-wrap">
        {COUNTRY_OF_CONCERN_WARNING}
      </TooltipContent>
    </Tooltip>
  )
}
