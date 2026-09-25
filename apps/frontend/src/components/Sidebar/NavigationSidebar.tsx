import {
  IconBrain,
  IconChartDots3,
  IconChevronLeft,
  IconCode,
  IconDeviceLaptop,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconMessageCode,
  IconMoon,
  IconReportAnalytics,
  IconSun,
} from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useTheme } from '~/contexts/ThemeContext'
import { ThemeToggle } from '../UIUC-Components/ThemeToggle'

interface NavItem {
  name: React.ReactNode
  icon: React.ReactElement
  link: string
}

interface NavigationSidebarProps {
  course_name: string
  isOpen: boolean
  onToggle: () => void
  activeLink: string
  isCollapsed: boolean
  onCollapseToggle: () => void
}

function NavText({
  children,
  collapsed,
}: {
  children: React.ReactNode
  collapsed?: boolean
}) {
  return (
    <span
      className={`${montserrat_heading.variable} font-montserratHeading ${
        collapsed ? 'hidden' : ''
      }`}
    >
      {children}
    </span>
  )
}

export function CollapsedThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'system') {
      setTheme('light')
    } else if (theme === 'light') {
      setTheme('dark')
    } else {
      setTheme('system')
    }
  }

  const getCurrentIcon = () => {
    switch (theme) {
      case 'system':
        return (
          <IconDeviceLaptop
            size={16}
            className="text-(--foreground)"
            aria-hidden="true"
          />
        )
      case 'light':
        return (
          <IconSun
            size={16}
            className="text-(--foreground)"
            aria-hidden="true"
          />
        )
      case 'dark':
        return (
          <IconMoon
            size={16}
            className="text-(--foreground)"
            aria-hidden="true"
          />
        )
      default:
        return (
          <IconDeviceLaptop
            size={16}
            className="text-(--foreground)"
            aria-hidden="true"
          />
        )
    }
  }

  const getCurrentTitle = () => {
    switch (theme) {
      case 'system':
        return 'System theme (click for light)'
      case 'light':
        return 'Light theme (click for dark)'
      case 'dark':
        return 'Dark theme (click for system)'
      default:
        return 'Toggle theme'
    }
  }

  return (
    <button
      onClick={cycleTheme}
      className="rounded-full border border-(--dashboard-border) bg-(--background-faded) p-1.5 transition-all hover:scale-105 hover:border-(--dashboard-faded) hover:bg-(--dashboard-faded)"
      aria-label={getCurrentTitle()}
      title={getCurrentTitle()}
    >
      {getCurrentIcon()}
    </button>
  )
}

export default function NavigationSidebar({
  course_name,
  isOpen,
  onToggle,
  activeLink,
  isCollapsed,
  onCollapseToggle,
}: NavigationSidebarProps) {
  const router = useRouter()

  const navItems: NavItem[] = [
    {
      name: <NavText>Dashboard</NavText>,
      icon: <IconHome size={20} strokeWidth={2} aria-hidden="true" />,
      link: course_name ? `/${course_name}/dashboard` : '/dashboard',
    },
    {
      name: <NavText>LLMs</NavText>,
      icon: (
        <IconBrain
          size={18}
          strokeWidth={2}
          style={{ marginRight: '3px', marginLeft: '3px' }}
          aria-hidden="true"
        />
      ),
      link: course_name ? `/${course_name}/llms` : '/llms',
    },
    {
      name: <NavText>Analysis</NavText>,
      icon: (
        <IconReportAnalytics
          size={18}
          strokeWidth={2}
          style={{ marginRight: '3px', marginLeft: '3px' }}
          aria-hidden="true"
        />
      ),
      link: course_name ? `/${course_name}/analysis` : '/analysis',
    },
    {
      name: <NavText>Prompting</NavText>,
      icon: (
        <IconMessageCode
          size={18}
          strokeWidth={2}
          style={{ marginRight: '3px', marginLeft: '3px' }}
          aria-hidden="true"
        />
      ),
      link: course_name ? `/${course_name}/prompt` : '/prompt',
    },
    {
      name: <NavText>Tools</NavText>,
      icon: (
        <IconChartDots3
          size={18}
          strokeWidth={2}
          style={{ marginRight: '3px', marginLeft: '3px' }}
          aria-hidden="true"
        />
      ),
      link: course_name ? `/${course_name}/tools` : '/tools',
    },
    {
      name: <NavText>API</NavText>,
      icon: (
        <IconCode
          size={18}
          strokeWidth={2}
          style={{ marginRight: '3px', marginLeft: '3px' }}
          aria-hidden="true"
        />
      ),
      link: course_name ? `/${course_name}/api` : '/api',
    },
  ]

  const handleChatNavigation = () => {
    if (course_name) {
      // Special case: if course_name is "chat", redirect to /chat instead of /chat/chat
      if (course_name === 'chat') {
        router.push('/chat')
      } else {
        router.push(`/${course_name}/chat`)
      }
    }
  }

  const handleLinkHover = (href: string) => {
    // Prefetch the page when user hovers over the link
    router.prefetch(href)
  }

  return (
    <>
      {/* Mobile Toggle Button - Hidden on md+ */}
      {!isOpen && (
        <button
          aria-label="Toggle sidebar"
          className="fixed top-[calc(90px+var(--announcement-banner-height))] left-[16px] z-40 flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-(--radius-lg) border-none bg-(--dashboard-button) text-(--dashboard-button-foreground) shadow-md transition-all hover:scale-105 hover:bg-(--dashboard-button-hover) md:hidden"
          onClick={onToggle}
        >
          <IconMenu2 size={20} aria-hidden="true" />
        </button>
      )}

      {/* Mobile Overlay - Hidden on md+ */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Settings navigation"
        className={`fixed top-[calc(80px+var(--announcement-banner-height))] bottom-0 left-0 z-30 h-auto min-h-[calc(100vh-80px-var(--announcement-banner-height))] w-[280px] border-r border-(--dashboard-border) bg-(--sidebar-background) transition-all duration-300 ease-in-out md:bottom-auto md:h-[calc(100vh-80px-var(--announcement-banner-height))] md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-[80px]' : ''}`}
      >
        <div
          className={`flex h-full flex-col py-4 ${
            isCollapsed ? 'items-center px-[10px]' : 'px-4'
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center border-b border-(--dashboard-border) pb-3 ${
              isCollapsed ? 'mb-4 justify-center' : 'mb-5 justify-between'
            }`}
          >
            {/* Breadcrumb - Always visible on mobile, conditionally on desktop */}
            <div
              className={`mr-4 rounded-(--radius-md) bg-(--background-faded) p-3 text-[13px] text-(--foreground) ${
                isCollapsed ? 'hidden' : ''
              }`}
            >
              <div
                className={`flex items-center gap-2 ${montserrat_heading.variable} font-montserratHeading`}
              >
                <span>Chatbot</span>
                <span>/</span>
                <span className="line-clamp-3 font-semibold break-all text-(--foreground)">
                  {course_name}
                </span>
              </div>
            </div>
            {/* Collapse Button - Hidden on mobile, visible on desktop */}
            <button
              aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="hidden h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-(--radius-md) border-2 border-(--dashboard-border) bg-transparent text-(--foreground) transition-all hover:border-(--dashboard-faded) hover:bg-(--dashboard-faded) md:flex"
              onClick={onCollapseToggle}
            >
              {isCollapsed ? (
                <IconLayoutSidebarLeftExpand
                  size={20}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : (
                <IconLayoutSidebarLeftCollapse
                  size={20}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
            </button>
          </div>

          {/* Chat Button */}
          <button
            tabIndex={0}
            className={`mb-5 flex cursor-pointer items-center justify-center rounded-(--radius-md) border-none bg-(--dashboard-button) text-sm font-medium text-(--dashboard-button-foreground) transition-all hover:-translate-y-px hover:bg-(--dashboard-button-hover) hover:shadow-sm ${
              isCollapsed
                ? 'min-h-[40px] w-[48px] gap-0 p-3'
                : 'w-full gap-[10px] px-4 py-3'
            }`}
            onClick={handleChatNavigation}
            onMouseEnter={() => {
              if (course_name) {
                // Special case: if course_name is "chat", prefetch /chat instead of /chat/chat
                const chatUrl =
                  course_name === 'chat' ? '/chat' : `/${course_name}/chat`
                handleLinkHover(chatUrl)
              }
            }}
          >
            <IconChevronLeft size={16} strokeWidth={3} aria-hidden="true" />
            <span
              className={`md:${isCollapsed ? 'hidden' : 'inline'} ${
                montserrat_paragraph.variable
              } font-montserratParagraph font-bold`}
            >
              Back to Chat
            </span>
          </button>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto p-1">
            {navItems.map((item, index) => (
              <Link
                tabIndex={0}
                role="button"
                key={index}
                href={item.link}
                prefetch={false}
                data-active={activeLink === item.link}
                className={`relative mb-[10px] flex items-center rounded-(--radius-md) text-sm font-medium text-(--navbar-foreground) no-underline transition-all hover:bg-(--navbar-hover-background) hover:text-(--navbar-hover) data-[active=true]:bg-(--dashboard-button) data-[active=true]:font-semibold data-[active=true]:text-(--dashboard-button-foreground) data-[active=true]:hover:bg-(--dashboard-button-hover) data-[active=true]:hover:text-(--dashboard-button-foreground) ${
                  isCollapsed
                    ? 'justify-center gap-0 p-3 hover:scale-105'
                    : 'gap-3 px-4 py-3'
                }`}
                onMouseEnter={() => handleLinkHover(item.link)}
                onClick={() => {
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 768) {
                    onToggle()
                  }
                }}
              >
                {item.icon}
                <span className={`md:${isCollapsed ? 'hidden' : 'inline'}`}>
                  {item.name}
                </span>
              </Link>
            ))}
          </div>

          {/* Theme Toggle at the bottom */}
          <div className="mt-auto flex w-full justify-center border-t border-(--dashboard-border) pt-4">
            {!isCollapsed ? <ThemeToggle /> : <CollapsedThemeToggle />}
          </div>
        </div>
      </aside>
    </>
  )
}
