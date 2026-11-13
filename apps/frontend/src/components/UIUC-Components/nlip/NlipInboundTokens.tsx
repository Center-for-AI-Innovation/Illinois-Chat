import { useState } from 'react'
import { Button } from '~/components/shadcn/ui/button'
import { Input } from '~/components/shadcn/ui/input'
import { Label } from '~/components/shadcn/ui/label'
import {
  useCreateNlipToken,
  useNlipTokens,
  useRevokeNlipToken,
} from '~/hooks/queries/useNlipTokens'

// Tokens other bot creators paste into their NLIP agent settings, together
// with this project's name, to query this project.
export default function NlipInboundTokens({ project }: { project: string }) {
  const tokens = useNlipTokens(project)
  const create = useCreateNlipToken(project)
  const revoke = useRevokeNlipToken(project)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)

  async function generate() {
    try {
      await create.mutateAsync(name.trim())
      setName('')
      setCopied(false)
    } catch {
      /* Mutation state renders the server's error below. */
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Access tokens</h3>
      <p className="text-sm">
        Give another bot creator this project name and a token. They add both to
        their NLIP agent settings. Revoke a token to cut off that bot.
      </p>
      <p className="text-sm">
        Project name: <code>{project}</code>
      </p>

      {tokens.isPending && <p>Loading tokens…</p>}
      {tokens.isError && <p role="alert">{tokens.error.message}</p>}
      {tokens.isSuccess && tokens.data.length === 0 && (
        <p className="text-sm">No tokens yet.</p>
      )}
      {tokens.isSuccess && tokens.data.length > 0 && (
        <ul className="space-y-2">
          {tokens.data.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3">
              <span>
                {t.name}{' '}
                <span className="text-sm opacity-70">
                  created {new Date(t.createdAt).toLocaleDateString()}
                </span>
              </span>
              <Button
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(t.id)}
              >
                Revoke {t.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoke.isError && <p role="alert">{revoke.error.message}</p>}

      <div className="flex items-end gap-3">
        <div className="grow">
          <Label htmlFor="nlip-token-name">New token name</Label>
          <Input
            id="nlip-token-name"
            placeholder="e.g. who you are sharing with"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button disabled={!name.trim() || create.isPending} onClick={generate}>
          {create.isPending ? 'Generating…' : 'Generate token'}
        </Button>
      </div>
      {create.isError && <p role="alert">{create.error.message}</p>}
      {create.isSuccess && (
        <div role="status" className="space-y-2 rounded-md border p-3">
          <p className="text-sm">
            Copy the token for “{create.data.name}” now. It will not be shown
            again.
          </p>
          <code className="block break-all">{create.data.token}</code>
          <Button variant="outline" onClick={() => copy(create.data.token)}>
            {copied ? 'Copied' : 'Copy token'}
          </Button>
        </div>
      )}
    </div>
  )
}
