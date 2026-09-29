import { montserrat_heading } from 'fonts'
import { Skeleton } from '~/components/shadcn/ui/skeleton'

interface NavbarBrandProps {
  primaryWord: string
  secondaryWord: string
  logoSrc: string
}

/**
 * The logo and two-word wordmark. The words are configurable from /admin; the
 * orange-then-foreground colouring is the brand and is not.
 */
export function NavbarBrand({
  primaryWord,
  secondaryWord,
  logoSrc,
}: NavbarBrandProps) {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 font-bold ${montserrat_heading.variable} font-montserratHeading`}
    >
      <img
        src={logoSrc}
        alt=""
        className="h-10 w-auto max-w-32 shrink-0 object-contain"
      />
      <span className="truncate text-2xl font-extrabold tracking-tight text-(--illinois-orange-branding) sm:text-[1.8rem]">
        {primaryWord} <span className="text-(--foreground)">{secondaryWord}</span>
      </span>
    </span>
  )
}

export function NavbarBrandSkeleton() {
  return (
    <span className="flex items-center gap-2" aria-hidden="true">
      <Skeleton className="size-10 rounded-md" />
      <Skeleton className="h-7 w-32 rounded-md sm:w-40" />
    </span>
  )
}
