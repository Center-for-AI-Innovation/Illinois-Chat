import { type ReactNode, useEffect } from 'react'

import { SidebarProvider } from '@/components/shadcn/ui/sidebar'
import { AdminSidebar } from './AdminSidebar'
import { ADMIN_CONTENT_ID, followSectionUntilSettled } from './adminScroll'
import { GlobalNav } from './GlobalNav'
import { SubPageHeader } from './SubPageHeader'

// Figma "Admin Sub-Pages": global nav over a bordered admin panel holding the
// settings sidebar and a scrolling content area.
export function AdminLayout({
  courseName,
  children,
}: {
  courseName: string
  children: ReactNode
}) {
  // Arriving with a hash (a direct link, or a sidebar section link from
  // another page): headings only exist once the page's access checks pass and
  // this layout mounts, and the sections above keep growing as data loads, so
  // follow the heading until the layout settles.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    return id ? followSectionUntilSettled(id) : undefined
  }, [])

  return (
    <div className="bg-background flex h-svh flex-col">
      <GlobalNav />
      <div className="flex min-h-0 flex-1 p-4 md:p-8">
        <SidebarProvider className="bg-background border-border min-h-0 overflow-hidden rounded-xl border shadow-sm">
          <AdminSidebar courseName={courseName} />
          <div className="flex min-w-0 flex-1 flex-col">
            <SubPageHeader courseName={courseName} />
            <main
              id={ADMIN_CONTENT_ID}
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto outline-none"
            >
              {children}
            </main>
          </div>
        </SidebarProvider>
      </div>
    </div>
  )
}
