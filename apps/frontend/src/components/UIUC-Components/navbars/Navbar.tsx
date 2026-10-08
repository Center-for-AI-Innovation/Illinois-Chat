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
import { AuthMenu } from './AuthMenu'
import { NavbarBrandLink } from './NavbarBrand'

interface NavbarProps {
  isPlain?: boolean
  /** Lets a sticky sub-bar directly below own the divider instead. */
  hideBorder?: boolean
}

interface NavItem {
  label: string
  href: string
  icon: TablerIcon
  external?: boolean
}

const navLinkVariants = cva(
  `flex items-center gap-2 rounded-md font-bold whitespace-nowrap no-underline transition-colors hover:bg-(--navbar-hover-background) hover:text-(--navbar-hover) data-[active=true]:text-(--navbar-active) ${montserrat_heading.variable} font-montserratHeading`,
  {
    variants: {
      placement: {
        bar: 'justify-center px-4 py-2.5 text-sm text-(--illinois-blue) dark:text-white',
        menu: 'w-full justify-start px-3 py-3 text-[13px] text-(--navbar-foreground) focus:bg-(--navbar-hover-background) focus:text-(--navbar-hover)',
      },
    },
  },
)

const navbarVariants = cva(
  'fixed top-(--announcement-banner-height) right-0 left-0 z-50 bg-white/95 backdrop-blur-xs dark:bg-[#13294b]',
  {
    variants: {
      bordered: {
        true: 'border-b border-border dark:border-[#32517a]',
        false: '',
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

export default function Navbar({
  isPlain = false,
  hideBorder = false,
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
    <div className={navbarVariants({ bordered: !hideBorder })}>
      <header className="mx-auto flex h-(--navbar-height) w-full max-w-[1680px] items-center gap-2 px-4 sm:px-8 lg:gap-4">
        <NavbarBrandLink />

        <div className="flex-1" />

        {!isPlain && (
          <nav aria-label="Main navigation" className="hidden lg:block">
            <ul className="m-0 flex list-none items-center gap-2 p-0">
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
            <Skeleton className="size-8 rounded-full" aria-hidden="true" />
          ) : (
            <AuthMenu size={32} />
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
