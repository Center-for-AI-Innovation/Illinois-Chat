import Link from 'next/link'
import { House, WandSparkles } from 'lucide-react'

import { buttonVariants } from '@/components/shadcn/ui/button'
import { cn } from '@/components/shadcn/lib/utils'
import { montserrat_heading } from 'fonts'
import { AuthMenu } from '../navbars/AuthMenu'

const NAV_LINKS = [
  { href: '/chatbots', label: 'Chatbots Hub', icon: House },
  { href: '/new', label: 'Create Your Own Bot', icon: WandSparkles },
]

// Figma "Global-Nav": wordmark left; ghost nav buttons + avatar right.
export function GlobalNav() {
  return (
    <header className="bg-background border-border flex h-[72px] shrink-0 items-center justify-between border-b px-4 md:px-12">
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
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href} className="m-0">
              <Link
                href={href}
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'text-primary shadow-xs',
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
    </header>
  )
}
