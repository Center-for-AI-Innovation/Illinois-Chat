import { type MouseEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ChevronRight, Monitor, Moon, Sun, Undo2 } from 'lucide-react'

import { Avatar, AvatarImage } from '@/components/shadcn/ui/avatar'
import { buttonVariants } from '@/components/shadcn/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/shadcn/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/shadcn/ui/sidebar'
import { cn } from '@/components/shadcn/lib/utils'
import { useTheme } from '~/contexts/ThemeContext'
import { ADMIN_HOME_PAGE, ADMIN_SETTINGS_PAGES } from './admin-pages'
import { type AdminPage } from './admin-pages.types'
import { replaceHash, scrollContentToTop, scrollToSection } from './adminScroll'

/** Current URL hash, read after mount (SSR has none) and kept in sync. */
function useLocationHash() {
  const router = useRouter()
  const [hash, setHash] = useState('')

  useEffect(() => {
    const update = () => setHash(window.location.hash.slice(1))
    update()
    router.events.on('hashChangeComplete', update)
    window.addEventListener('hashchange', update)
    return () => {
      router.events.off('hashChangeComplete', update)
      window.removeEventListener('hashchange', update)
    }
  }, [router.events])

  return [hash, setHash] as const
}

// Leave cmd/ctrl/shift/middle clicks to the browser (open in new tab, etc.).
const isPlainClick = (e: MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

function PageItem({
  page,
  courseName,
  activePath,
  hash,
  setHash,
}: {
  page: AdminPage
  courseName: string
  activePath: string
  hash: string
  setHash: (hash: string) => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const href = `/${courseName}/${page.path}`
  const isCurrent = activePath === page.path
  const Icon = page.icon

  // On the current page, scroll in place instead of navigating: the page
  // item goes back to the top, a section item to its heading. On other pages
  // the Link navigates and AdminLayout scrolls to the hash once mounted.
  const scrollInPlace = (sectionId?: string) => (e: MouseEvent) => {
    if (isMobile) setOpenMobile(false)
    if (!isCurrent || !isPlainClick(e)) return
    e.preventDefault()
    if (sectionId) scrollToSection(sectionId)
    else scrollContentToTop()
    replaceHash(sectionId ?? '')
    setHash(sectionId ?? '')
  }

  if (!page.sections?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isCurrent}
          onClick={scrollInPlace()}
          render={
            <Link href={href} aria-current={isCurrent ? 'page' : undefined} />
          }
        >
          <Icon aria-hidden="true" />
          <span>{page.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  // On the page itself, highlight the section in the hash (first by default).
  const activeSection = isCurrent ? hash || page.sections[0]?.id : undefined

  return (
    <Collapsible defaultOpen={isCurrent} render={<SidebarMenuItem />}>
      <SidebarMenuButton
        onClick={scrollInPlace()}
        render={
          <Link href={href} aria-current={isCurrent ? 'page' : undefined} />
        }
      >
        <Icon aria-hidden="true" />
        <span>{page.title}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={
          <SidebarMenuAction
            aria-label={`Toggle ${page.title} sections`}
            className="top-2 data-panel-open:[&>svg]:rotate-90"
          />
        }
      >
        <ChevronRight aria-hidden="true" className="transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {page.sections.map((section) => (
            <SidebarMenuSubItem key={section.id}>
              <SidebarMenuSubButton
                isActive={activeSection === section.id}
                onClick={scrollInPlace(section.id)}
                render={
                  <Link
                    href={`${href}#${section.id}`}
                    aria-current={
                      activeSection === section.id ? 'location' : undefined
                    }
                  />
                }
              >
                <span>{section.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Default', icon: Monitor },
] as const

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-muted flex rounded-lg p-1"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'text-foreground flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm transition-colors [&_svg]:size-4',
            theme === value
              ? 'bg-background shadow-sm'
              : 'hover:bg-background/60',
          )}
        >
          <Icon aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

function SidebarBody({ courseName }: { courseName: string }) {
  const router = useRouter()
  const [hash, setHash] = useLocationHash()
  // "/[course_name]/ai-models" -> "ai-models"
  const activePath = router.pathname.split('/').pop() ?? ''

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <Avatar shape="square" className="bg-(--illinois-blue) p-1">
            <AvatarImage src="/media/logo_illinois.png" alt="" />
          </Avatar>
          <span className="text-sidebar-foreground truncate text-sm leading-none font-semibold">
            {courseName}
          </span>
        </div>
      </SidebarHeader>
      <div className="px-2">
        <Link
          href={`/${courseName}/chat`}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'w-full',
          )}
        >
          <Undo2 aria-hidden="true" />
          Go to Chat
        </Link>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <PageItem
              page={ADMIN_HOME_PAGE}
              courseName={courseName}
              activePath={activePath}
              hash={hash}
              setHash={setHash}
            />
          </SidebarMenu>
          <SidebarGroupLabel>Project Settings</SidebarGroupLabel>
          <SidebarMenu>
            {ADMIN_SETTINGS_PAGES.map((page) => (
              <PageItem
                key={page.path}
                page={page}
                courseName={courseName}
                activePath={activePath}
                hash={hash}
                setHash={setHash}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t">
        <ThemeSwitcher />
      </SidebarFooter>
    </>
  )
}

// Desktop: an in-panel column that the header trigger shows/hides.
// Mobile: the shadcn Sidebar's built-in Sheet.
export function AdminSidebar({ courseName }: { courseName: string }) {
  const { isMobile, open } = useSidebar()

  if (isMobile) {
    return (
      <Sidebar>
        <SidebarBody courseName={courseName} />
      </Sidebar>
    )
  }
  if (!open) return null
  return (
    <Sidebar collapsible="none" aria-label="Project settings">
      <SidebarBody courseName={courseName} />
    </Sidebar>
  )
}
