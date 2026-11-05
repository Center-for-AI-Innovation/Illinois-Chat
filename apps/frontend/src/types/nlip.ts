import { z } from 'zod'

// HTTP JSON profile used by nlip-project/nlip_sdk 0.1.3. The protocol's
// conversation and authorization tokens are submessages, not top-level fields.
const format = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(
    z.enum([
      'text',
      'token',
      'structured',
      'binary',
      'location',
      'error',
      'generic',
    ]),
  )
const part = z.object({
  format,
  subformat: z.string().min(1).max(128),
  content: z.union([z.string().max(64_000), z.record(z.unknown())]),
  label: z.string().max(128).nullish(),
})
export const nlipMessageSchema = part.extend({
  messagetype: z.string().max(128).nullish(),
  submessages: z.array(part).max(32).nullish(),
})
export type NlipMessage = z.infer<typeof nlipMessageSchema>

export const nlipAgentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  // Another project in this Illinois Chat deployment.
  project: z.string().trim().min(1).max(256),
  enabled: z.boolean().default(true),
})
export type NlipAgent = z.infer<typeof nlipAgentSchema>
export type PublicNlipAgent = NlipAgent & { hasToken: boolean }

// Project-scoped token that lets other agents query this project.
export const nlipTokenNameSchema = z.string().trim().min(1).max(64)
export interface NlipInboundToken {
  id: string
  name: string
  createdAt: string
}

export const nlipConfigInputSchema = z
  .object({
    inboundEnabled: z.boolean(),
    agents: z
      .array(
        nlipAgentSchema.extend({
          // Omission keeps the stored token; null removes it. Never returned to UI.
          token: z.string().min(1).max(4096).nullable().optional(),
        }),
      )
      .max(20),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.agents.map((a) => a.id)).size !== value.agents.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Agent IDs must be unique',
        path: ['agents'],
      })
    }
  })

export function nlipText(content: string, conversation?: string): NlipMessage {
  return {
    format: 'text',
    subformat: 'english',
    content,
    ...(conversation
      ? {
          submessages: [
            {
              format: 'token',
              subformat: 'conversation',
              content: conversation,
            },
          ],
        }
      : {}),
  }
}

export function nlipToken(
  message: NlipMessage,
  kind: 'conversation' | 'authorization',
): string | undefined {
  const tokens = [message, ...(message.submessages ?? [])].filter(
    (p) => p.format === 'token' && p.subformat.toLowerCase() === kind,
  )
  if (
    tokens.length > 1 ||
    tokens.some(
      (p) =>
        typeof p.content !== 'string' || !p.content || p.content.length > 4096,
    )
  ) {
    throw new Error(`Invalid or duplicate ${kind} token`)
  }
  return tokens[0]?.content as string | undefined
}

export function nlipQuestion(message: NlipMessage): string {
  if (message.messagetype?.toLowerCase() === 'control') {
    throw new Error(
      'Control messages are not supported by this text question endpoint',
    )
  }
  const parts = [message, ...(message.submessages ?? [])]
  if (
    parts.some(
      (p) =>
        p.format !== 'text' &&
        !(
          p.format === 'token' &&
          ['conversation', 'authorization'].includes(p.subformat.toLowerCase())
        ),
    )
  ) {
    throw new Error(
      'Only text and conversation/authorization tokens are supported for questions',
    )
  }
  const text = parts
    .filter((p) => p.format === 'text')
    .map((p) => {
      if (typeof p.content !== 'string')
        throw new Error('Text content must be a string')
      return p.content
    })
    .join('\n')
    .trim()
  if (!text || text.length > 16_000)
    throw new Error('Question must contain 1–16000 characters')
  return text
}
