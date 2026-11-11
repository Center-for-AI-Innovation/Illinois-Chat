import Link from 'next/link'
import { House, WandSparkles } from 'lucide-react'

import { buttonVariants } from '@/components/shadcn/ui/button'
import { cn } from '@/components/shadcn/lib/utils'
import { montserrat_heading } from 'fonts'
import { AuthMenu } from './AuthMenu'

const GLOBAL_NAV_LINKS = [
  { href: '/chatbots', label: 'Chatbots Hub', icon: House },
  { href: '/new', label: 'Create Your Own Bot', icon: WandSparkles },
]

interface GlobalNavProps {
  /** `static` sits in the page flow (admin shell). `fixed` pins it to the top
   *  of the viewport, so the page must offset its content by the nav height
   *  (72px), as the chatbots hub and new-chatbot pages do. */
  position?: 'static' | 'fixed'
  /** Hide the bottom border, e.g. when a sticky sub-bar owns the divider. */
  hideBorder?: boolean
}

// Figma "Global-Nav": wordmark left; ghost nav buttons + avatar right. Shared
// by the admin shell and the chatbots hub / new-chatbot pages.
export function GlobalNav({
  position = 'static',
  hideBorder = false,
}: GlobalNavProps = {}) {
  const isFixed = position === 'fixed'
  return (
    <header
      className={cn(
        'shrink-0',
        isFixed
          ? 'bg-background/95 fixed inset-x-0 top-0 z-50 backdrop-blur-xs'
          : 'bg-background',
        !hideBorder && 'border-border border-b',
      )}
    >
      <div
        className={cn(
          'flex h-[72px] items-center justify-between px-4 sm:px-8 md:px-12',
          isFixed && 'mx-auto w-full max-w-[1680px]',
        )}
      >
        <Link
          href="/"
          aria-label="Illinois Chat home"
          className={cn(
            montserrat_heading.variable,
            'font-montserratHeading text-2xl font-bold whitespace-nowrap',
          )}
        >
          <span className="text-(--illinois-orange-branding)">Illinois</span>{' '}
          <span className="text-foreground">Chat</span>
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-6">
          <ul className="m-0 flex list-none items-center gap-1 p-0">
            {GLOBAL_NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href} className="m-0">
                <Link
                  href={href}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    'text-primary',
                  )}
                >
                  <Icon aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <AuthMenu size={32} />
        </nav>
      </div>
    </header>
  )
}
