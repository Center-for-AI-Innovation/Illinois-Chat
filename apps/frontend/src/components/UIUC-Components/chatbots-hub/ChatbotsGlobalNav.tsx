import { IconHome, IconSparkles } from '@tabler/icons-react'
import { montserrat_heading } from 'fonts'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { AuthMenu } from '~/components/UIUC-Components/navbars/AuthMenu'

const navItems = [
  { label: 'Chatbots Hub', icon: IconHome, link: '/chatbots' },
  { label: 'Create Your Own Bot', icon: IconSparkles, link: '/new' },
]

interface ChatbotsGlobalNavProps {
  /** Hide the default bottom border. Useful when the page wants a sticky
   *  sub-bar (e.g. a search/filter bar) to own the divider instead. */
  hideBorder?: boolean
}

export function ChatbotsGlobalNav({
  hideBorder = false,
}: ChatbotsGlobalNavProps = {}) {
  const router = useRouter()
  const activePath = router.asPath.split('?')[0]

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 bg-white/95 backdrop-blur-xs dark:bg-[#13294b] ${
        hideBorder ? '' : 'border-border border-b dark:border-[#32517a]'
      }`}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1680px] items-center justify-between px-4 sm:px-8">
        <Link
          href="/"
          className={`relative flex items-center gap-0 font-bold ${montserrat_heading.variable} font-montserratHeading`}
        >
          <div style={{ width: '2.5rem', height: '2.5rem' }}>
            <img
              alt="Illinois Logo"
              src="/media/logo_illinois.png"
              width="auto"
              height="100%"
            ></img>
          </div>

          <div className="text-2xl font-extrabold tracking-tight text-(--illinois-orange-branding) sm:ml-2 sm:text-[1.8rem]">
            Illinois <span className="text-(--foreground)">Chat</span>
          </div>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            return (
              <Link
                key={item.link}
                href={item.link}
                className={`${
                  montserrat_heading.variable
                } font-montserratHeading flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-(--illinois-blue) transition-colors sm:px-4 sm:text-sm dark:text-white`}
              >
                <item.icon size={20} strokeWidth={2} />
                {item.label}
              </Link>
            )
          })}
          <AuthMenu size={32} />
        </div>
      </div>
    </header>
  )
}
