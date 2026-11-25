import { type ReactNode } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'

import { SidebarProvider } from '@/components/shadcn/ui/sidebar'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import Navbar from '~/components/UIUC-Components/navbars/Navbar'
import { useFetchCourseMetadata } from '~/hooks/queries/useFetchCourseMetadata'
import { useFetchIsSuperAdmin } from '~/hooks/queries/useFetchIsSuperAdmin'
import { AdminSidebar } from './AdminSidebar'
import { ADMIN_CONTENT_ID } from './adminScroll'
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
              className="min-h-0 flex-1 overflow-y-auto outline-none motion-safe:scroll-smooth"
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
  const router = useRouter()
  const auth = useAuth()
  const email = auth.user?.profile.email
  const {
    data: metadata,
    isLoading,
    error,
  } = useFetchCourseMetadata({
    courseName,
    enabled: auth.isAuthenticated,
  })
  // Same tiers as the server's get_user_permission: owner, course admin, or
  // super admin. Asked of the server because a Redis-granted super admin is
  // invisible to the client bundle.
  const { data: isSuperAdmin, isLoading: isSuperAdminLoading } =
    useFetchIsSuperAdmin({ enabled: auth.isAuthenticated })

  // Until the router has read the URL, courseName is empty and the metadata
  // query is disabled (which reports isLoading: false), so wait for it rather
  // than fall through to a 403.
  if (
    !router.isReady ||
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
    // After signing in, come back to the admin page that was asked for.
    return (
      <PermissionGate course_name={courseName} signInRedirect={router.asPath} />
    )
  }

  // Treat the chatbot the way the server does: a missing one is a 404, and a
  // frozen (or forbidden) one rejects every save, so it gets the 403 screen.
  const status = (error as { status?: number } | null)?.status
  if (status === 404) {
    return <PermissionGate course_name={courseName} errorType={404} />
  }
  if (metadata?.is_frozen === true || status === 403) {
    return <PermissionGate course_name={courseName} errorType={403} />
  }

  // Cached metadata survives a failed refetch; with none, fail closed.
  const isOwnerOrAdmin =
    !!metadata &&
    !!email &&
    (metadata.course_owner === email ||
      (metadata.course_admins ?? []).includes(email))

  if (!(isSuperAdmin === true || isOwnerOrAdmin)) {
    return <PermissionGate course_name={courseName} errorType={403} />
  }

  return <AdminShell courseName={courseName}>{children}</AdminShell>
}
