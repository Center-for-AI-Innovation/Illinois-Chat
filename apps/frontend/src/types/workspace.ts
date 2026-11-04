import { z } from 'zod/v4'

export const searchInputSchema = z.object({
  query: z.string().min(1).describe('A focused search query'),
})

export const searchOutputSchema = z.object({
  sources: z.array(
    z.object({
      n: z.number().int().positive().optional(),
      title: z.string(),
      text: z.string().optional(),
      url: z
        .string()
        .nullish()
        .transform((url) => url || undefined),
      page: z
        .union([z.string(), z.number()])
        .nullish()
        .transform((page) =>
          page === null || page === undefined || page === ''
            ? undefined
            : String(page),
        ),
    }),
  ),
})

export const planStepStatus = z.enum(['pending', 'in_progress', 'done'])

export const planInputSchema = z.object({
  title: z.string().describe('A short name for the plan'),
  description: z
    .string()
    .optional()
    .describe('One sentence describing the approach'),
  steps: z
    .array(
      z.object({
        title: z.string().describe('What this step accomplishes'),
        status: planStepStatus,
      }),
    )
    .min(1)
    .max(12),
})

export const artifactKind = z.enum(['document', 'code', 'html'])

export const artifactInputSchema = z.object({
  title: z.string().describe('A short, descriptive title'),
  kind: artifactKind.describe(
    'document for Markdown prose, code for a source file, html for a complete self-contained page',
  ),
  language: z
    .string()
    .optional()
    .describe('Programming language when kind is code, for example python'),
  content: z.string().describe('The full artifact content'),
})

export const workspaceMetadataSchema = z.object({
  modelId: z.string().optional(),
  contextTokens: z.number().optional(),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      outputTokenDetails: z
        .object({ reasoningTokens: z.number().optional() })
        .optional(),
      inputTokenDetails: z
        .object({ cacheReadTokens: z.number().optional() })
        .optional(),
    })
    .optional(),
  feedback: z
    .object({
      isPositive: z.boolean().nullable(),
      category: z.string().nullable(),
      details: z.string().nullable(),
    })
    .optional(),
  uploads: z
    .object({
      files: z.array(
        z.object({ name: z.string(), mediaType: z.string().optional() }),
      ),
      contexts: z.array(
        z.object({
          title: z.string(),
          text: z.string(),
          page: z.string().optional(),
        }),
      ),
    })
    .optional(),
})

export type PlanInput = z.infer<typeof planInputSchema>
export type PlanStepStatus = z.infer<typeof planStepStatus>
export type ArtifactInput = z.infer<typeof artifactInputSchema>
export type ArtifactKind = z.infer<typeof artifactKind>
export type WorkspaceSource = z.infer<
  typeof searchOutputSchema
>['sources'][number]
export type WorkspaceMetadata = z.infer<typeof workspaceMetadataSchema>

export interface WorkspaceArtifact {
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  content: string
  streaming: boolean
}
