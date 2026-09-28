import {
  IconClipboardText,
  IconHome,
  IconMenu2,
  IconShieldCheck,
  IconSparkles,
  type TablerIcon,
} from '@tabler/icons-react'
import { cva } from 'class-variance-authority'
import { montserrat_heading } from 'fonts'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'
import { useAuth } from 'react-oidc-context'
import { Button } from '~/components/shadcn/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/shadcn/ui/dropdown-menu'
import { Skeleton } from '~/components/shadcn/ui/skeleton'
import { useFetchIsSuperAdmin } from '~/hooks/queries/useFetchIsSuperAdmin'
import { useFetchNavbarBranding } from '~/hooks/queries/useFetchNavbarBranding'
import {
  DEFAULT_NAVBAR_BRANDING,
  DEFAULT_NAVBAR_LOGO_SRC,
} from '~/utils/platformSettings.schema'
import { AuthMenu } from './AuthMenu'
import { NavbarBrand, NavbarBrandSkeleton } from './NavbarBrand'

interface NavbarProps {
  course_name?: string
  bannerUrl?: string
  isPlain?: boolean
}

interface NavItem {
  label: string
  href: string
  icon: TablerIcon
  external?: boolean
}

const navLinkVariants = cva(
  `flex items-center gap-[0.4rem] rounded-md text-[13px] font-bold whitespace-nowrap text-(--navbar-foreground) no-underline transition-colors hover:bg-(--navbar-hover-background) hover:text-(--navbar-hover) data-[active=true]:bg-(--navbar-background) data-[active=true]:text-(--navbar-active) ${montserrat_heading.variable} font-montserratHeading`,
  {
    variants: {
      placement: {
        bar: 'justify-center px-3 py-2.5',
        menu: 'w-full justify-start px-3 py-3 focus:bg-(--navbar-hover-background) focus:text-(--navbar-hover)',
      },
    },
  },
)

const GLOBAL_NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Docs',
    href: 'https://docs.uiuc.chat/',
    icon: IconClipboardText,
    external: true,
  },
  { label: 'My Chatbots', href: '/chatbots', icon: IconHome },
  { label: 'Create Your Own Bot', href: '/new', icon: IconSparkles },
]

const ADMIN_NAV_ITEM: NavItem = {
  label: 'Admin',
  href: '/admin',
  icon: IconShieldCheck,
}

function externalLinkProps(item: NavItem) {
  return item.external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : undefined
}

function Brand() {
  const { data, isError } = useFetchNavbarBranding()
  const branding = data ?? (isError ? DEFAULT_NAVBAR_BRANDING : undefined)

  if (!branding) return <NavbarBrandSkeleton />

  return (
    <Link
      href="/"
      aria-label={`${branding.primaryWord} ${branding.secondaryWord} home`}
      className="flex min-w-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--illinois-orange)"
    >
      <NavbarBrand
        primaryWord={branding.primaryWord}
        secondaryWord={branding.secondaryWord}
        logoSrc={branding.logoUrl ?? DEFAULT_NAVBAR_LOGO_SRC}
      />
    </Link>
  )
}

function BannerImage({ url, courseName }: { url: string; courseName: string }) {
  const altText = courseName ? `${courseName} logo` : 'Course chatbot logo'
  return (
    <div className="flex h-full min-w-0 flex-1 items-center overflow-hidden px-4 sm:px-6">
      <Image
        src={url}
        className="h-full w-auto object-contain object-left"
        width={2000}
        height={2000}
        alt={altText}
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
    </div>
  )
}

export default function Navbar({
  course_name = '',
  bannerUrl = '',
  isPlain = false,
}: NavbarProps) {
  const router = useRouter()
  const auth = useAuth()
  const posthog = usePostHog()
  // Gated on the server's answer, not the NEXT_PUBLIC env list: a
  // Redis-granted super admin is invisible to the client bundle.
  const { data: isSuperAdmin } = useFetchIsSuperAdmin({
    enabled: auth.isAuthenticated,
  })

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return
    posthog?.identify(auth.user?.profile.sub || 'unknown', {
      email: auth.user?.profile.email || 'no_email',
    })
  }, [auth.isLoading, auth.isAuthenticated])

  const navItems =
    isSuperAdmin === true
      ? [...GLOBAL_NAV_ITEMS, ADMIN_NAV_ITEM]
      : GLOBAL_NAV_ITEMS
  const activePath = router.asPath?.split('?')[0]

  return (
    <div className="fixed top-(--announcement-banner-height) right-0 left-0 z-50 bg-(--navbar-background)">
      <header className="flex h-20 w-full items-center gap-2 border-b border-(--navbar-border) bg-(--navbar-background) px-4 sm:px-6">
        <Brand />

        {bannerUrl ? (
          <BannerImage url={bannerUrl} courseName={course_name} />
        ) : (
          <div className="flex-1" />
        )}

        {!isPlain && (
          <nav aria-label="Main navigation" className="hidden lg:block">
            <ul className="m-0 flex list-none items-center gap-1 p-0">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-active={activePath === item.href}
                    className={navLinkVariants({ placement: 'bar' })}
                    {...externalLinkProps(item)}
                  >
                    <item.icon size={20} strokeWidth={2} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {auth.isLoading ? (
            <Skeleton className="size-[34px] rounded-full" aria-hidden="true" />
          ) : (
            <AuthMenu />
          )}

          {!isPlain && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle Menu"
                    className="rounded-md text-(--foreground) lg:hidden [&_svg]:size-5"
                  />
                }
              >
                <IconMenu2 aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-64 rounded-md border border-(--navbar-border) bg-(--background-faded) p-1"
              >
                {navItems.map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    className="p-0"
                    render={
                      <Link
                        href={item.href}
                        data-active={activePath === item.href}
                        className={navLinkVariants({ placement: 'menu' })}
                        {...externalLinkProps(item)}
                      />
                    }
                  >
                    <item.icon size={20} strokeWidth={2} aria-hidden="true" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
    </div>
  )
}
