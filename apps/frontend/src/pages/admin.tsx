// Super-admin control panel. Thin by design: every panel below owns its own
// data fetching, states, and writes.
//
// This route is exempt from the maintenance gate in `_app.tsx` — it is where
// an operator turns maintenance back off, so gating it would make maintenance
// unrecoverable.

import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { ShieldAlert } from 'lucide-react'
import Head from 'next/head'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '~/components/shadcn/ui/tabs'
import { LoadingSpinner } from '~/components/UIUC-Components/LoadingSpinner'
import { LandingPageHeader } from '~/components/UIUC-Components/navbars/GlobalHeader'
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

      <LandingPageHeader forGeneralPurposeNotLandingpage={true} />

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-screen bg-white dark:bg-[#081735]"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-6">
            <h1
              className={`text-2xl font-bold text-[--illinois-blue] dark:text-white sm:text-3xl ${montserrat_heading.variable} font-montserratHeading`}
            >
              Platform admin
            </h1>
            <p
              className={`mt-2 max-w-2xl text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3] ${montserrat_paragraph.variable} font-montserratParagraph`}
            >
              Runtime settings for everyone using Illinois Chat, plus
              per-project connection overrides. Changes here are not scoped to
              one project.
            </p>
          </header>

          {isAuthPending ? (
            <div className="flex justify-center py-24">
              <LoadingSpinner />
            </div>
          ) : !auth.isAuthenticated || isSuperAdmin !== true ? (
            <AccessDenied isAuthenticated={auth.isAuthenticated} />
          ) : (
            <Tabs value={tab} onValueChange={handleTabChange}>
              {/* Sticky so the tab bar stays reachable while scrolling a long
                  connections table. */}
              <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[#e5e7eb] bg-white/95 px-4 py-3 backdrop-blur dark:border-[#32517a] dark:bg-[#081735]/95 sm:-mx-6 sm:px-6">
                <TabsList>
                  <TabsTrigger value="platform" className="gap-2">
                    Platform
                    {isPlatformDirty && (
                      <span
                        aria-label="unsaved changes"
                        className="h-1.5 w-1.5 rounded-full bg-[--illinois-orange]"
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="connections">Connections</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="platform"
                className="mt-0 flex flex-col gap-6"
              >
                <PlatformSettingsForm onDirtyChange={handleDirtyChange} />
                <SuperAdminsCard />
              </TabsContent>

              <TabsContent value="connections" className="mt-0">
                <ProjectConnectionsTable />
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
              className="bg-red-600 text-white hover:bg-red-700"
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
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-[14px] border border-[#e5e7eb] bg-white p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:border-[#32517a] dark:bg-[#13294b] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      <ShieldAlert
        className="h-10 w-10 text-[--illinois-orange]"
        aria-hidden="true"
      />
      <h2 className="text-lg font-semibold text-[--illinois-blue] dark:text-white">
        {isAuthenticated ? 'Not a super admin' : 'Sign in required'}
      </h2>
      <p className="text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
        {isAuthenticated
          ? 'This page is limited to platform super admins. Ask an existing super admin to grant you access.'
          : 'Sign in with a super-admin account to manage platform settings.'}
      </p>
      {!isAuthenticated && (
        <button
          type="button"
          onClick={() => void auth.signinRedirect()}
          className="rounded-md bg-[--illinois-orange] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--illinois-orange] focus-visible:ring-offset-2"
        >
          Sign in
        </button>
      )}
    </div>
  )
}
