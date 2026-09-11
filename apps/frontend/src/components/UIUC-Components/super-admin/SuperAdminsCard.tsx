// The super-admin roster: env entries (read-only) plus Redis grants (editable).

import { Loader2, Lock, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
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
import { Button } from '~/components/shadcn/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/shadcn/ui/empty'
import { Input } from '~/components/shadcn/ui/input'
import { Label } from '~/components/shadcn/ui/label'
import { useFetchSuperAdmins } from '~/hooks/queries/useFetchSuperAdmins'
import { useUpdateSuperAdmins } from '~/hooks/queries/useUpdateSuperAdmins'
import { superAdminEmailSchema } from '~/utils/platformSettings.schema'
import { showErrorToast, showSuccessToast } from '~/utils/toastUtils'
import {
  AdminCard,
  AdminCardSkeleton,
  AdminInlineError,
  AdminInlineWarning,
} from './AdminCard'

export function SuperAdminsCard() {
  const auth = useAuth()
  const currentEmail = (
    (auth.user?.profile.email as string | undefined) ?? ''
  ).toLowerCase()

  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchSuperAdmins()
  const updateAdmins = useUpdateSuperAdmins()

  const [emailInput, setEmailInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (isPending) return <AdminCardSkeleton rows={3} />

  if (isError) {
    return (
      <AdminInlineError
        title="Could not load super admins"
        message={error instanceof Error ? error.message : 'Unknown error'}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    )
  }

  const envAdmins = data?.envAdmins ?? []
  const grantedAdmins = data?.grantedAdmins ?? []
  const hasAny = envAdmins.length > 0 || grantedAdmins.length > 0

  async function handleAdd() {
    const parsed = superAdminEmailSchema.safeParse(emailInput)
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? 'Enter a valid email')
      return
    }
    setInputError(null)
    setActionError(null)
    try {
      await updateAdmins.mutateAsync({ action: 'add', email: parsed.data })
      setEmailInput('')
      showSuccessToast(`${parsed.data} can now reach this page.`, 'Admin added')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setActionError(message)
      showErrorToast(message, 'Could not add admin')
    }
  }

  async function handleRemove(email: string) {
    setActionError(null)
    try {
      await updateAdmins.mutateAsync({ action: 'remove', email })
      showSuccessToast(
        `${email} no longer has platform or project access.`,
        'Admin removed',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setActionError(message)
      showErrorToast(message, 'Could not remove admin')
    } finally {
      setPendingRemoval(null)
    }
  }

  return (
    <>
      <AdminCard
        title="Super admins"
        blastRadius="Full access to this page and admin-level access to every project. Revoking takes effect on the next request."
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
      >
        <div className="flex flex-col gap-5">
          {data?.warning && <AdminInlineWarning message={data.warning} />}
          {actionError && (
            <AdminInlineError title="Action failed" message={actionError} />
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="super-admin-email">Add by email</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="super-admin-email"
                type="email"
                value={emailInput}
                autoComplete="off"
                placeholder="netid@illinois.edu"
                aria-invalid={!!inputError}
                aria-describedby={
                  inputError ? 'super-admin-email-error' : undefined
                }
                onChange={(event) => {
                  setEmailInput(event.target.value)
                  if (inputError) setInputError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleAdd()
                  }
                }}
                className="rounded-[8px] sm:flex-1"
              />
              <Button
                type="button"
                variant="dashboard"
                onClick={() => void handleAdd()}
                disabled={updateAdmins.isPending || emailInput.trim() === ''}
                className="gap-2"
              >
                {updateAdmins.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                Add admin
              </Button>
            </div>
            {inputError && (
              <p
                id="super-admin-email-error"
                className="text-sm font-medium text-destructive"
              >
                {inputError}
              </p>
            )}
          </div>

          {hasAny ? (
            <ul className="flex flex-col divide-y divide-[#e5e7eb] dark:divide-[#32517a]">
              {envAdmins.map((email) => (
                <li
                  key={`env-${email}`}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                    {email}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 gap-1 rounded-[8px] border-[#e5e7eb] dark:border-[#32517a]"
                  >
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Environment
                  </Badge>
                  {/* No remove control on purpose. The env allowlist is the
                      recovery floor when Redis is unreachable, so it is only
                      changeable through deployment config. */}
                </li>
              ))}
              {grantedAdmins.map((email) => (
                <li
                  key={`grant-${email}`}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                    {email}
                  </span>
                  {email === currentEmail && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-[8px] border-[--illinois-orange] text-[--illinois-orange]"
                    >
                      You
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                    aria-label={`Remove ${email} from super admins`}
                    disabled={updateAdmins.isPending}
                    onClick={() => setPendingRemoval(email)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty className="border border-dashed border-[#e5e7eb] py-8 dark:border-[#32517a]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldCheck aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No super admins</EmptyTitle>
                <EmptyDescription>
                  Add an email above, or set SUPER_ADMIN_EMAILS in the
                  deployment environment.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </AdminCard>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval === currentEmail
                ? 'This is your own account. You will lose access to this page and to every project you do not personally own, immediately.'
                : 'They lose access to this page and admin-level access to every project, immediately. Projects they own are unaffected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingRemoval) void handleRemove(pendingRemoval)
              }}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
