import { useEffect, useState } from 'react'
import { Button } from '~/components/shadcn/ui/button'
import { Card } from '~/components/shadcn/ui/card'
import { Input } from '~/components/shadcn/ui/input'
import { Label } from '~/components/shadcn/ui/label'
import { Switch } from '~/components/shadcn/ui/switch'
import { useNlipConfig, useSaveNlipConfig } from '~/hooks/queries/useNlipConfig'
import { clearCachedSimTools } from '~/utils/functionCalling/handleFunctionCalling'
import type { PublicNlipAgent } from '~/types/nlip'
import NlipInboundTokens from './NlipInboundTokens'

type AgentForm = PublicNlipAgent & { tokenInput: string; removeToken: boolean }
export default function NlipAgentsPanel({ project }: { project: string }) {
  const query = useNlipConfig(project)
  const save = useSaveNlipConfig(project)
  const [agents, setAgents] = useState<AgentForm[]>([])
  const [inbound, setInbound] = useState(false)
  useEffect(() => {
    if (!query.data) return
    setAgents(
      query.data.agents.map((a) => ({
        ...a,
        tokenInput: '',
        removeToken: false,
      })),
    )
    setInbound(query.data.inboundEnabled)
  }, [query.data])
  function update(index: number, patch: Partial<AgentForm>) {
    setAgents((current) =>
      current.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    )
  }
  async function submit() {
    try {
      await save.mutateAsync({
        inboundEnabled: inbound,
        agents: agents.map(
          ({ tokenInput, removeToken, hasToken: _hasToken, ...a }) => ({
            ...a,
            ...(removeToken
              ? { token: null }
              : tokenInput
                ? { token: tokenInput }
                : {}),
          }),
        ),
      })
      clearCachedSimTools(project)
    } catch {
      /* Mutation state renders the server's error below. */
    }
  }
  return (
    <Card className="mt-[2%] space-y-4 rounded-4xl border p-6 shadow-none ring-0">
      <h2 className="text-xl font-semibold">
        Natural Language Interaction Protocol (NLIP)
      </h2>
      <p>
        Connect another agent so this project can ask it focused questions.
        Remote answers appear in the chat’s tool results and Agent Mode
        activity.
      </p>
      {query.isPending && <p>Loading NLIP configuration…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {query.isSuccess && (
        <>
          <div className="flex items-center gap-3">
            <Switch
              id="nlip-inbound"
              checked={inbound}
              onCheckedChange={setInbound}
            />
            <Label htmlFor="nlip-inbound">
              Let other agents query this project
            </Label>
          </div>
          <p className="text-sm">
            Endpoint: <code>/api/nlip/{encodeURIComponent(project)}</code>.
            Callers need one of the access tokens below. Each request uses this
            project’s default model and settings.
          </p>
          {inbound && <NlipInboundTokens project={project} />}
          {agents.map((a, index) => (
            <Card key={index} className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3>Remote agent {index + 1}</h3>
                <Button
                  variant="outline"
                  onClick={() =>
                    setAgents((all) => all.filter((_, i) => i !== index))
                  }
                >
                  Remove agent {index + 1}
                </Button>
              </div>
              {(
                [
                  ['id', 'Agent ID (lowercase letters, digits, underscores)'],
                  ['name', 'Agent name'],
                  ['description', 'When should the model ask this agent?'],
                  ['project', 'Project name of the bot to ask'],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <Label htmlFor={`nlip-${field}-${index}`}>{label}</Label>
                  <Input
                    id={`nlip-${field}-${index}`}
                    value={a[field]}
                    onChange={(e) => update(index, { [field]: e.target.value })}
                  />
                </div>
              ))}
              <p className="text-sm">
                The bot must be another project on this Illinois Chat deployment
                with NLIP access turned on. Only the question is sent; uploaded
                files and chat history are not shared.
              </p>
              <Label htmlFor={`nlip-token-${index}`}>
                Access token from that project’s owner{' '}
                {a.hasToken ? '(stored; leave blank to keep)' : ''}
              </Label>
              <Input
                type="password"
                autoComplete="new-password"
                id={`nlip-token-${index}`}
                value={a.tokenInput}
                onChange={(e) =>
                  update(index, {
                    tokenInput: e.target.value,
                    removeToken: false,
                  })
                }
              />
              {a.hasToken && (
                <Button
                  variant="outline"
                  onClick={() => update(index, { removeToken: !a.removeToken })}
                >
                  {a.removeToken
                    ? 'Keep stored token'
                    : 'Clear stored token on save'}
                </Button>
              )}
              <div className="flex items-center gap-3">
                <Switch
                  id={`nlip-enabled-${index}`}
                  checked={a.enabled}
                  onCheckedChange={(v) => update(index, { enabled: v })}
                />
                <Label htmlFor={`nlip-enabled-${index}`}>
                  Offer this agent as a chat tool
                </Label>
              </div>
            </Card>
          ))}
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={agents.length >= 20 || save.isPending}
              onClick={() =>
                setAgents((all) => [
                  ...all,
                  {
                    id: '',
                    name: '',
                    description: '',
                    project: '',
                    enabled: true,
                    hasToken: false,
                    tokenInput: '',
                    removeToken: false,
                  },
                ])
              }
            >
              Add NLIP agent
            </Button>
            <Button disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save NLIP configuration'}
            </Button>
          </div>
          {save.isSuccess && <p role="status">NLIP configuration saved.</p>}
          {save.isError && <p role="alert">{save.error.message}</p>}
        </>
      )}
    </Card>
  )
}
