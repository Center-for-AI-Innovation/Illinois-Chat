// Per-project external connection editor.
//
// Form state is hand-rolled rather than react-hook-form + a zod resolver, and
// that is deliberate: the values arriving from the API have their secrets
// masked to their last 4 characters, so "what is in the input" and "what
// should be sent" are different questions. A resolver bound to the full kind
// schema would either reject the masked value or send it back as if it were
// the credential. Instead a submit builds a patch from only the fields the
// operator actually changed and validates that, and the server validates the
// merged result against the full schema.

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PlugZap,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { z } from 'zod'
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
import { Button } from '~/components/shadcn/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/shadcn/ui/dialog'
import { Input } from '~/components/shadcn/ui/input'
import { Label } from '~/components/shadcn/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/shadcn/ui/select'
import { Skeleton } from '~/components/shadcn/ui/skeleton'
import { Switch } from '~/components/shadcn/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '~/components/shadcn/ui/tabs'
import { useFetchProjectConnection } from '~/hooks/queries/useFetchProjectConnections'
import { useTestProjectConnection } from '~/hooks/queries/useTestProjectConnection'
import { useUpdateProjectConnection } from '~/hooks/queries/useUpdateProjectConnection'
import {
  CONNECTION_KINDS,
  configSchemaByKind,
  type ConnectionKind,
} from '~/utils/projectConnections/validation'
import { showErrorToast, showSuccessToast } from '~/utils/toastUtils'
import { AdminInlineError, AdminInlineWarning } from './AdminCard'
import {
  CONNECTION_KIND_META,
  CONNECTION_PROPAGATION_NOTICE,
  isMaskedSecret,
  type ConnectionFieldDescriptor,
} from './admin.types'

type FieldValue = string | boolean
type FieldValues = Record<string, FieldValue>

interface ProjectConnectionEditorProps {
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CONFIG_KEY_BY_KIND = {
  s3: 's3_config',
  database: 'database_config',
  qdrant: 'qdrant_config',
  embedding: 'embedding_config',
} as const satisfies Record<ConnectionKind, string>

function initialValuesFor(
  fields: readonly ConnectionFieldDescriptor[],
  config: Record<string, unknown> | null,
): FieldValues {
  const values: FieldValues = {}
  for (const field of fields) {
    const stored = config?.[field.name]
    if (field.type === 'switch') {
      values[field.name] =
        typeof stored === 'boolean' ? stored : field.switchDefault ?? false
    } else if (field.type === 'select') {
      values[field.name] =
        typeof stored === 'string' ? stored : field.options?.[0] ?? ''
    } else if (field.type === 'secret') {
      // Never the stored value: what comes back is a mask, and this entry
      // backs the input whose contents get sent. Seeding it with the mask
      // would submit `****cdef` as the credential the moment an operator
      // opened the field. The mask is displayed from `storedValue` instead.
      values[field.name] = ''
    } else {
      values[field.name] = stored == null ? '' : String(stored)
    }
  }
  return values
}

export function ProjectConnectionEditor({
  projectName,
  open,
  onOpenChange,
}: ProjectConnectionEditorProps) {
  const { data, isPending, isError, error, refetch, isFetching } =
    useFetchProjectConnection(projectName, { enabled: open })
  const updateConnection = useUpdateProjectConnection()
  const testConnection = useTestProjectConnection()

  const [kind, setKind] = useState<ConnectionKind>('qdrant')
  const [values, setValues] = useState<FieldValues>({})
  const [editingSecrets, setEditingSecrets] = useState<Set<string>>(new Set())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const meta = CONNECTION_KIND_META[kind]
  const storedConfig = useMemo(() => {
    const raw = data?.[CONFIG_KEY_BY_KIND[kind]]
    return (raw as Record<string, unknown> | null | undefined) ?? null
  }, [data, kind])
  const isConfigured = storedConfig !== null

  const initialValues = useMemo(
    () => initialValuesFor(meta.fields, storedConfig),
    [meta.fields, storedConfig],
  )

  // Re-seed whenever the selected kind or the fetched row changes. Any
  // in-progress secret edits are dropped with it, which is correct — they
  // belonged to the previous kind.
  useEffect(() => {
    setValues(initialValues)
    setEditingSecrets(new Set())
    setFieldErrors({})
    setFormError(null)
    testConnection.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues])

  /**
   * Only what the operator actually changed.
   *
   * A secret counts only while its input is open *and* non-empty, so an
   * untouched masked value is never echoed back, and clearing the input means
   * "keep the stored secret" rather than "set it to empty".
   */
  const changedFields = useMemo(() => {
    const patch: Record<string, unknown> = {}
    for (const field of meta.fields) {
      const value = values[field.name]
      if (field.type === 'secret') {
        if (
          editingSecrets.has(field.name) &&
          value !== '' &&
          // Belt and braces: a mask must never leave here even if it somehow
          // ends up in the input.
          !isMaskedSecret(value)
        ) {
          patch[field.name] = value
        }
        continue
      }
      if (value !== initialValues[field.name] && value !== '') {
        patch[field.name] = value
      }
    }
    return patch
  }, [meta.fields, values, initialValues, editingSecrets])

  const hasChanges = Object.keys(changedFields).length > 0

  function setField(name: string, value: FieldValue) {
    setValues((previous) => ({ ...previous, [name]: value }))
    setFieldErrors((previous) => {
      if (!previous[name]) return previous
      const next = { ...previous }
      delete next[name]
      return next
    })
  }

  function applyZodIssues(zodError: z.ZodError): void {
    const errors: Record<string, string> = {}
    for (const issue of zodError.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length === 0) {
      setFormError(zodError.issues[0]?.message ?? 'Invalid configuration')
    }
  }

  async function handleSave() {
    setFormError(null)
    setFieldErrors({})

    if (isConfigured) {
      // Partial update. The stored config supplies everything omitted here,
      // and the server rejects the merge if the result is not a valid config.
      try {
        await updateConnection.mutateAsync({
          action: 'patch',
          projectName,
          kind,
          config: changedFields,
        })
        setEditingSecrets(new Set())
        showSuccessToast(
          `${meta.label} updated for ${projectName}.`,
          'Connection saved',
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setFormError(message)
        showErrorToast(message, 'Could not save connection')
      }
      return
    }

    // First-time configuration: no stored config to merge against, so the
    // whole thing has to be valid here and now.
    const candidate: Record<string, unknown> = {}
    for (const field of meta.fields) {
      const value = values[field.name]
      if (field.type === 'switch') {
        candidate[field.name] = value
      } else if (value !== '') {
        candidate[field.name] = value
      }
    }

    const parsed = configSchemaByKind[kind].safeParse(candidate)
    if (!parsed.success) {
      applyZodIssues(parsed.error)
      return
    }

    try {
      await updateConnection.mutateAsync({
        action: 'upsert',
        projectName,
        kind,
        config: parsed.data as Record<string, unknown>,
      })
      setEditingSecrets(new Set())
      showSuccessToast(
        `${meta.label} configured for ${projectName}.`,
        'Connection saved',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setFormError(message)
      showErrorToast(message, 'Could not save connection')
    }
  }

  async function handleRemove() {
    setRemoveOpen(false)
    try {
      await updateConnection.mutateAsync({ action: 'clear', projectName, kind })
      showSuccessToast(
        `${meta.label} removed. ${projectName} falls back to the platform default.`,
        'Configuration removed',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setFormError(message)
      showErrorToast(message, 'Could not remove configuration')
    }
  }

  const testResult = testConnection.data
  const rowIsActive = data?.is_active === true

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing with a half-typed secret is easy to do by accident — Esc
          // or a click outside — and there is nothing to recover it from.
          if (!next && hasChanges) {
            setDiscardOpen(true)
            return
          }
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[14px] dark:border-[#32517a] dark:bg-[#13294b]">
          <DialogHeader>
            <DialogTitle className="text-[--illinois-blue] dark:text-white">
              External connections
            </DialogTitle>
            <DialogDescription className="break-words">
              {projectName}
            </DialogDescription>
          </DialogHeader>

          {isPending ? (
            <div className="flex flex-col gap-4 py-2">
              <Skeleton className="h-10 w-full rounded-[8px]" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full rounded-[8px]" />
              <Skeleton className="h-10 w-full rounded-[8px]" />
            </div>
          ) : isError ? (
            <AdminInlineError
              title="Could not load this project's connections"
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[--background-faded] px-4 py-3 dark:bg-[#0c1f3f]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[--illinois-blue] dark:text-white">
                    Connection overrides
                  </p>
                  <p className="text-xs text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                    {rowIsActive
                      ? 'Active — this project uses the configs below.'
                      : 'Disabled — this project uses the platform defaults.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Label
                    htmlFor="connection-active"
                    className="text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]"
                  >
                    {rowIsActive ? 'Active' : 'Disabled'}
                  </Label>
                  <Switch
                    id="connection-active"
                    checked={rowIsActive}
                    disabled={!data?.found || updateConnection.isPending}
                    aria-label="Use these connection overrides"
                    onCheckedChange={(next) => {
                      void updateConnection
                        .mutateAsync({
                          action: 'setActive',
                          projectName,
                          isActive: next,
                        })
                        .catch((err: unknown) => {
                          const message =
                            err instanceof Error ? err.message : 'Unknown error'
                          setFormError(message)
                        })
                    }}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-[--illinois-storm-medium] dark:text-[#94a3b8]">
                <Clock
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <p>{CONNECTION_PROPAGATION_NOTICE}</p>
              </div>

              <Tabs
                value={kind}
                onValueChange={(next) => setKind(next as ConnectionKind)}
              >
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                  {CONNECTION_KINDS.map((connectionKind) => {
                    const configured =
                      (data?.[CONFIG_KEY_BY_KIND[connectionKind]] ?? null) !==
                      null
                    return (
                      <TabsTrigger
                        key={connectionKind}
                        value={connectionKind}
                        className="gap-1.5 capitalize"
                      >
                        {connectionKind}
                        {configured && (
                          <span
                            aria-label="configured"
                            className="h-1.5 w-1.5 rounded-full bg-[--illinois-orange]"
                          />
                        )}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </Tabs>

              <div>
                <p className="text-sm font-semibold text-[--illinois-blue] dark:text-white">
                  {meta.label}
                </p>
                <p className="mt-1 text-sm text-[--illinois-storm-dark] dark:text-[#c8d2e3]">
                  {meta.description}
                </p>
              </div>

              {formError && (
                <AdminInlineError title="Save failed" message={formError} />
              )}

              {!isConfigured && (
                <AdminInlineWarning
                  message={`No ${meta.label.toLowerCase()} is configured for this project yet. All required fields below must be filled in.`}
                />
              )}

              <div className="flex flex-col gap-5">
                {meta.fields.map((field) => (
                  <ConnectionField
                    key={field.name}
                    field={field}
                    value={values[field.name] ?? ''}
                    storedValue={storedConfig?.[field.name]}
                    isEditingSecret={editingSecrets.has(field.name)}
                    error={fieldErrors[field.name]}
                    onChange={(value) => setField(field.name, value)}
                    onToggleSecretEdit={(editing) => {
                      setEditingSecrets((previous) => {
                        const next = new Set(previous)
                        if (editing) next.add(field.name)
                        else next.delete(field.name)
                        return next
                      })
                      if (!editing) setField(field.name, '')
                    }}
                  />
                ))}
              </div>

              {testResult && (
                <div
                  role="status"
                  className={`flex gap-3 rounded-[8px] border p-3 text-sm ${
                    testResult.ok
                      ? 'border-green-300 bg-green-50 text-green-900 dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-200'
                      : 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <p className="min-w-0 break-words">
                    {testResult.ok
                      ? `Reached the saved ${meta.label.toLowerCase()}.`
                      : testResult.message ?? 'The probe failed.'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-[#e5e7eb] pt-4 dark:border-[#32517a] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={
                      !isConfigured || testConnection.isPending || hasChanges
                    }
                    title={
                      hasChanges
                        ? 'Save your changes first — this probes the saved configuration.'
                        : undefined
                    }
                    onClick={() =>
                      void testConnection
                        .mutateAsync({ projectName, kind })
                        .catch((err: unknown) => {
                          setFormError(
                            err instanceof Error
                              ? err.message
                              : 'Unknown error',
                          )
                        })
                    }
                  >
                    {testConnection.isPending ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <PlugZap className="h-4 w-4" aria-hidden="true" />
                    )}
                    Test saved connection
                  </Button>
                  {isConfigured && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                      disabled={updateConnection.isPending}
                      onClick={() => setRemoveOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="dashboard"
                  className="gap-2"
                  disabled={
                    updateConnection.isPending || (isConfigured && !hasChanges)
                  }
                  onClick={() => void handleSave()}
                >
                  {updateConnection.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isConfigured ? 'Save changes' : 'Create configuration'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this connection have not been saved. Any secret you
              typed cannot be recovered after closing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setDiscardOpen(false)
                onOpenChange(false)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {meta.label} config?</AlertDialogTitle>
            <AlertDialogDescription>
              {projectName} falls back to the platform default for this
              connection. The stored credentials are deleted and cannot be
              recovered from here. Backend workers may keep using the old config
              for up to 30 minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleRemove()}
            >
              Remove configuration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ConnectionField({
  field,
  value,
  storedValue,
  isEditingSecret,
  error,
  onChange,
  onToggleSecretEdit,
}: {
  field: ConnectionFieldDescriptor
  value: FieldValue
  storedValue: unknown
  isEditingSecret: boolean
  error?: string
  onChange: (value: FieldValue) => void
  onToggleSecretEdit: (editing: boolean) => void
}) {
  const inputId = `connection-field-${field.name}`
  const helpId = `${inputId}-help`
  const errorId = `${inputId}-error`
  const describedBy =
    [field.helpText ? helpId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined

  const label = (
    <Label htmlFor={inputId} className="flex items-center gap-2">
      {field.label}
      {field.required && (
        <span className="text-xs font-normal text-[--illinois-storm-medium] dark:text-[#94a3b8]">
          required
        </span>
      )}
    </Label>
  )

  const help = field.helpText ? (
    <p
      id={helpId}
      className="text-xs text-[--illinois-storm-medium] dark:text-[#94a3b8]"
    >
      {field.helpText}
    </p>
  ) : null

  const errorNode = error ? (
    <p id={errorId} className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null

  if (field.type === 'switch') {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {label}
          {help}
        </div>
        <Switch
          id={inputId}
          checked={value === true}
          onCheckedChange={(next) => onChange(next)}
          aria-describedby={describedBy}
          className="mt-1 shrink-0"
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        {label}
        <Select value={String(value)} onValueChange={(next) => onChange(next)}>
          <SelectTrigger
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            className="rounded-[8px]"
          >
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
        {errorNode}
      </div>
    )
  }

  if (field.type === 'secret') {
    const hasStored = typeof storedValue === 'string' && storedValue !== ''
    return (
      <div className="space-y-2">
        {label}
        {hasStored && !isEditingSecret ? (
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate rounded-[8px] border border-[#e5e7eb] bg-[--background-faded] px-3 py-2 font-mono text-sm text-[--illinois-storm-dark] dark:border-[#32517a] dark:bg-[#0c1f3f] dark:text-[#c8d2e3]">
              {String(storedValue)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onToggleSecretEdit(true)}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Input
              id={inputId}
              type="password"
              autoComplete="new-password"
              value={String(value)}
              placeholder={field.placeholder}
              aria-describedby={describedBy}
              aria-invalid={!!error}
              onChange={(event) => onChange(event.target.value)}
              className="rounded-[8px]"
            />
            {hasStored && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onToggleSecretEdit(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
        {hasStored && isEditingSecret && (
          <p className="flex items-center gap-1.5 text-xs text-[--illinois-storm-medium] dark:text-[#94a3b8]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Leave blank to keep the current value.
          </p>
        )}
        {help}
        {errorNode}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {label}
      <Input
        id={inputId}
        type={field.type === 'number' ? 'number' : 'text'}
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        value={String(value)}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[8px]"
      />
      {help}
      {errorNode}
    </div>
  )
}
