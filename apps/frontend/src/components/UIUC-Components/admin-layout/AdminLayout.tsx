import { type ReactNode, useEffect } from 'react'
import { useAuth } from 'react-oidc-context'

import { SidebarProvider } from '@/components/shadcn/ui/sidebar'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import Navbar from '~/components/UIUC-Components/navbars/Navbar'
import { useFetchCourseMetadata } from '~/hooks/queries/useFetchCourseMetadata'
import { useFetchIsSuperAdmin } from '~/hooks/queries/useFetchIsSuperAdmin'
import { AdminSidebar } from './AdminSidebar'
import { ADMIN_CONTENT_ID, followSectionUntilSettled } from './adminScroll'
import { SubPageHeader } from './SubPageHeader'

// Figma "Admin Sub-Pages": global nav over a bordered admin panel holding the
// settings sidebar and a scrolling content area.
function AdminShell({
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
    <div className="bg-background flex h-(--viewport-height) flex-col pt-(--navbar-height)">
      <Navbar />
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

/**
 * Every admin page renders inside this layout, so the access check lives here:
 * only the chatbot owner, one of its admins or a super admin sees the page. Everyone else
 * gets the existing permission screen (403, or the sign-in prompt when signed
 * out), and the page's children are never rendered for them.
 *
 * This is a UI gate; the API routes enforce access on the server.
 */
export function AdminLayout({
  courseName,
  children,
}: {
  courseName: string
  children: ReactNode
}) {
  const auth = useAuth()
  const email = auth.user?.profile.email
  const {
    data: metadata,
    isLoading,
    isError,
  } = useFetchCourseMetadata({
    courseName,
    enabled: auth.isAuthenticated,
  })
  // Same tiers as the server's get_user_permission: owner, course admin, or
  // super admin. Asked of the server because a Redis-granted super admin is
  // invisible to the client bundle.
  const { data: isSuperAdmin, isLoading: isSuperAdminLoading } =
    useFetchIsSuperAdmin({ enabled: auth.isAuthenticated })

  if (
    auth.isLoading ||
    (auth.isAuthenticated && (isLoading || isSuperAdminLoading))
  ) {
    return (
      <div role="status" aria-busy="true" className="bg-background h-svh">
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return <PermissionGate course_name={courseName} />
  }

  // Fail closed: if the metadata cannot be read, only a super admin gets in,
  // and a failed super-admin lookup counts as "not a super admin".
  const isOwnerOrAdmin =
    !isError &&
    !!metadata &&
    !!email &&
    (metadata.course_owner === email ||
      (metadata.course_admins ?? []).includes(email))

  if (!(isSuperAdmin === true || isOwnerOrAdmin)) {
    return <PermissionGate course_name={courseName} errorType={403} />
  }

  return <AdminShell courseName={courseName}>{children}</AdminShell>
}
