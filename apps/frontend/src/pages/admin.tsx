// Super-admin control panel. Thin by design: every panel below owns its own
// data fetching, states, and writes.
//
// This route is exempt from the maintenance gate in `_app.tsx` — it is where
// an operator turns maintenance back off, so gating it would make maintenance
// unrecoverable.

import { montserrat_heading, montserrat_paragraph } from 'fonts'
import {
  Database,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import Head from 'next/head'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/shadcn/ui/alert-dialog'
import { Badge } from '~/components/shadcn/ui/badge'
import { Button, buttonVariants } from '~/components/shadcn/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/shadcn/ui/empty'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '~/components/shadcn/ui/tabs'
import { LoadingSpinner } from '~/components/UIUC-Components/LoadingSpinner'
import { LandingPageHeader } from '~/components/UIUC-Components/navbars/GlobalHeader'
import {
  adminTabsListClass,
  adminTabsTriggerClass,
} from '~/components/UIUC-Components/super-admin/AdminCard'
import { PlatformSettingsForm } from '~/components/UIUC-Components/super-admin/PlatformSettingsForm'
import { ProjectConnectionsTable } from '~/components/UIUC-Components/super-admin/ProjectConnectionsTable'
import { SuperAdminsCard } from '~/components/UIUC-Components/super-admin/SuperAdminsCard'
import {
  isAdminTab,
  type AdminTab,
} from '~/components/UIUC-Components/super-admin/admin.types'
import { useFetchIsSuperAdmin } from '~/hooks/queries/useFetchIsSuperAdmin'

export default function AdminPage() {
  const auth = useAuth()
  const { data: isSuperAdmin, isPending: isCheckPending } =
    useFetchIsSuperAdmin({ enabled: auth.isAuthenticated })

  const [tab, setTab] = useState<AdminTab>('platform')
  const [isPlatformDirty, setIsPlatformDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<AdminTab | null>(null)

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsPlatformDirty(dirty)
  }, [])

  function handleTabChange(next: string) {
    if (!isAdminTab(next)) return
    // Switching tabs unmounts the settings form and its unsaved values with
    // it, so the guard belongs here rather than inside the form.
    if (tab === 'platform' && next !== 'platform' && isPlatformDirty) {
      setPendingTab(next)
      return
    }
    setTab(next)
  }

  const isAuthPending =
    auth.isLoading || (auth.isAuthenticated && isCheckPending)

  return (
    <>
      <Head>
        <title>Admin — Illinois Chat</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <LandingPageHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-white dark:bg-[#081735] [&_[role=switch]:not([data-disabled])]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {isAuthPending ? (
            <div className="flex justify-center py-24">
              <LoadingSpinner />
            </div>
          ) : !auth.isAuthenticated || isSuperAdmin !== true ? (
            // Nothing about what this console controls renders until the
            // server has confirmed super-admin status.
            <AccessDenied isAuthenticated={auth.isAuthenticated} />
          ) : (
            <Tabs value={tab} onValueChange={handleTabChange} className="gap-0">
              <header className="mb-6 flex flex-col gap-3">
                <Badge
                  variant="outline"
                  className="h-6 rounded-[6px] border-(--illinois-orange)/40 bg-(--illinois-orange)/10 px-2 text-(--illinois-orange)"
                >
                  <ShieldCheck aria-hidden="true" />
                  Super admin
                </Badge>
                <h1
                  className={`text-2xl font-bold tracking-tight text-(--illinois-blue) sm:text-3xl dark:text-white ${montserrat_heading.variable} font-montserratHeading`}
                >
                  Platform admin
                </h1>
                <p
                  className={`max-w-2xl text-sm leading-6 text-(--illinois-storm-dark) dark:text-[#c8d2e3] ${montserrat_paragraph.variable} font-montserratParagraph`}
                >
                  Runtime settings for everyone using Illinois Chat,
                  per-project connection overrides, and who can administer the
                  platform. Changes here are not scoped to one project.
                </p>
              </header>

              {/* Sticky so the tab bar stays reachable while scrolling a long
                  connections table. */}
              <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[#e5e7eb] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:border-[#32517a] dark:bg-[#081735]/95">
                <TabsList
                  className={`h-10! w-full sm:w-fit ${adminTabsListClass}`}
                >
                  <TabsTrigger
                    value="platform"
                    className={`gap-2 px-3 sm:px-4 ${adminTabsTriggerClass}`}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    Platform
                    {isPlatformDirty && (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-(--illinois-orange)"
                        />
                        <span className="sr-only">(unsaved changes)</span>
                      </>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="connections"
                    className={`gap-2 px-3 sm:px-4 ${adminTabsTriggerClass}`}
                  >
                    <Database aria-hidden="true" />
                    Connections
                  </TabsTrigger>
                  <TabsTrigger
                    value="users"
                    className={`gap-2 px-3 sm:px-4 ${adminTabsTriggerClass}`}
                  >
                    <Users aria-hidden="true" />
                    Users
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="platform"
                className="mt-0 flex flex-col gap-6"
              >
                <PlatformSettingsForm onDirtyChange={handleDirtyChange} />
              </TabsContent>

              <TabsContent value="connections" className="mt-0">
                <ProjectConnectionsTable />
              </TabsContent>

              <TabsContent value="users" className="mt-0">
                <SuperAdminsCard />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTab(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your platform settings edits have not been saved and will be
              discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                if (pendingTab) setTab(pendingTab)
                setPendingTab(null)
                setIsPlatformDirty(false)
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AccessDenied({ isAuthenticated }: { isAuthenticated: boolean }) {
  const auth = useAuth()

  return (
    <Empty className="mx-auto mt-8 max-w-lg rounded-[14px] bg-white p-8 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e7eb] sm:mt-16 sm:p-10 dark:bg-[#13294b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] dark:ring-[#32517a]">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-12 rounded-full bg-(--illinois-orange)/10 text-(--illinois-orange)"
        >
          {isAuthenticated ? (
            <ShieldAlert aria-hidden="true" />
          ) : (
            <LogIn aria-hidden="true" />
          )}
        </EmptyMedia>
        <EmptyTitle
          role="heading"
          aria-level={1}
          className={`text-xl font-semibold text-(--illinois-blue) dark:text-white ${montserrat_heading.variable} font-montserratHeading`}
        >
          {isAuthenticated ? 'Not a super admin' : 'Sign in required'}
        </EmptyTitle>
        <EmptyDescription className="text-(--illinois-storm-dark) dark:text-[#c8d2e3]">
          {isAuthenticated
            ? 'This page is limited to platform super admins. Ask an existing super admin to grant you access.'
            : 'You need to sign in to view this page.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {isAuthenticated ? (
          <Link
            href="/chatbots"
            className={buttonVariants({
              variant: 'outline',
              className: 'rounded-[8px]',
            })}
          >
            Back to my chatbots
          </Link>
        ) : (
          <Button
            type="button"
            variant="dashboard"
            className="rounded-[8px] px-6"
            onClick={() => void auth.signinRedirect()}
          >
            <LogIn aria-hidden="true" />
            Sign in
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}
