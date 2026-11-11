import { type MouseEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { cva } from 'class-variance-authority'
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/shadcn/ui/toggle-group'
import { cn } from '@/components/shadcn/lib/utils'
import { useTheme } from '~/contexts/ThemeContext'
import { ADMIN_HOME_PAGE, ADMIN_SETTINGS_PAGES } from './admin-pages'
import { type AdminPage } from './admin-pages.types'
import { scrollContentToTop } from './adminScroll'
import {
  type ActiveSectionTracker,
  trackActiveSection,
} from './trackActiveSection'

/**
 * Current URL hash, read after mount (SSR has none) and kept in sync.
 * Only tracks the hash for highlighting; following a hash to its heading on
 * arrival is owned by AdminLayout (its layout effect is mount-only).
 */
function useLocationHash() {
  const router = useRouter()
  const [hash, setHash] = useState('')

  useEffect(() => {
    const update = () => setHash(window.location.hash.slice(1))
    update()
    router.events.on('hashChangeComplete', update)
    router.events.on('routeChangeComplete', update)
    window.addEventListener('hashchange', update)
    return () => {
      router.events.off('hashChangeComplete', update)
      router.events.off('routeChangeComplete', update)
      window.removeEventListener('hashchange', update)
    }
  }, [router.events])

  return [hash, setHash] as const
}

// Leave cmd/ctrl/shift/middle clicks to the browser (open in new tab, etc.).
const isPlainClick = (e: MouseEvent) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

// The shared sidebar uses leading-none, which together with the label's
// truncate (overflow hidden) clips descenders ("g" in "Prompting"). A real line
// height on the label span fixes it without changing the item height.
const LABEL_LINE_HEIGHT = '[&>span:last-child]:leading-5'

function PageItem({
  page,
  courseName,
  activePath,
  hash,
  onScrollStart,
}: {
  page: AdminPage
  courseName: string
  activePath: string
  hash: string
  /** Called before a click-triggered scroll, so scroll tracking pauses. */
  onScrollStart: () => void
}) {
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const href = `/${courseName}/${page.path}`
  const isCurrent = activePath === page.path
  const Icon = page.icon

  // Section links are plain Links: the router updates the URL hash (history
  // and asPath stay correct) and scrolls to the heading, smoothly via the
  // content panel's scroll-smooth. Only the page item on the current page is
  // handled here: back to the top, and the hash cleared through the router.
  const onClick = (e: MouseEvent) => {
    if (isMobile) setOpenMobile(false)
    if (!isCurrent || !isPlainClick(e)) return
    e.preventDefault()
    onScrollStart()
    scrollContentToTop()
    void router.replace(href, undefined, { shallow: true, scroll: false })
  }

  if (!page.sections?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isCurrent}
          className={LABEL_LINE_HEIGHT}
          onClick={onClick}
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
        isActive={isCurrent}
        className={LABEL_LINE_HEIGHT}
        onClick={onClick}
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
                className={LABEL_LINE_HEIGHT}
                isActive={activeSection === section.id}
                onClick={(e) => {
                  if (isMobile) setOpenMobile(false)
                  if (isCurrent && isPlainClick(e)) onScrollStart()
                }}
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

// Deliberately not ThemeToggle.tsx: the admin sidebar footer needs a labelled
// three-way radiogroup (Light / Dark / Default), not the icon-only toggle.
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Default', icon: Monitor },
] as const

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <ToggleGroup
      value={[theme]}
      onValueChange={(value) => {
        const next = THEME_OPTIONS.find((option) => option.value === value[0])
        if (next) setTheme(next.value)
      }}
      aria-label="Theme"
      spacing={1}
      className="bg-muted w-full rounded-lg p-1"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="text-foreground data-pressed:bg-background flex-1 gap-1.5 data-pressed:shadow-sm [&_svg]:size-4"
        >
          <Icon aria-hidden="true" />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function SidebarBody({ courseName }: { courseName: string }) {
  const router = useRouter()
  const [hash, setHash] = useLocationHash()
  // "/[course_name]/ai-models" -> "ai-models"
  const activePath = router.pathname.split('/').pop() ?? ''

  // Scroll following, for every admin page that lists sections: the highlight
  // moves with the section the reader has reached. State only; the URL is left
  // alone. Clicks pause it while their smooth scroll runs (see holdTracking).
  const sections = ADMIN_SETTINGS_PAGES.find(
    (page) => page.path === activePath,
  )?.sections
  const tracker = useRef<ActiveSectionTracker | null>(null)
  useEffect(() => {
    if (!sections?.length) return undefined
    const t = trackActiveSection(
      sections.map((section) => section.id),
      setHash,
    )
    tracker.current = t
    return () => {
      t.stop()
      tracker.current = null
    }
  }, [sections, setHash])
  const holdTracking = () => tracker.current?.hold()

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
              onScrollStart={holdTracking}
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
                onScrollStart={holdTracking}
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

const desktopSidebarVariants = cva(
  'overflow-hidden transition-[width] duration-200 ease-linear',
  {
    variants: { open: { true: '', false: 'w-0 min-w-0' } },
  },
)

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
  // Stay mounted when closed and collapse the width, so the header trigger
  // animates the panel instead of snapping it between one and two columns.
  // `inert` takes the hidden links out of the tab order. `min-w-0` lets the
  // shadcn Sidebar's width collapse past its content's min-content width.
  return (
    <Sidebar
      collapsible="none"
      aria-label="Project settings"
      inert={!open}
      className={desktopSidebarVariants({ open })}
    >
      {/* Fixed-width inner column: while the outer width animates to 0 the
          content is clipped instead of reflowing (and truncating) mid-way. */}
      <div className="flex h-full min-h-0 w-(--sidebar-width) shrink-0 flex-col">
        <SidebarBody courseName={courseName} />
      </div>
    </Sidebar>
  )
}
