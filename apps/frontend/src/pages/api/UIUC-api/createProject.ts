import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { checkCourseExists } from './getCourseExists'
import { writeCourseMetadata } from '~/utils/courseMetadataStore'
import type { CourseMetadata } from '~/types/courseMetadata'
import { db } from '~/db/dbClient'
import { preAuthorizedApiKeys, projects } from '~/db/schema'
import { encryptKeyIfNeeded } from '~/utils/crypto'
import { ensureRedisConnected } from '~/utils/redisClient'
import { superAdmins } from '~/utils/superAdmins'

const DEFAULT_METADATA_SCHEMA = {
  document_type: { type: 'string' },
  document_title: { type: 'string' },
  author: { type: 'string' },
  creation_date: { type: 'string', format: 'date' },
  keywords: { type: 'array', items: { type: 'string' } },
  category: { type: 'string' },
  summary: { type: 'string' },
}

function emailsInclude(emails: unknown, ownerEmail: string): boolean {
  if (!Array.isArray(emails)) return false
  const needle = ownerEmail.toLowerCase()
  return emails.some((email) => String(email).toLowerCase() === needle)
}

async function seedPreAssignedLlmKeys(
  projectName: string,
  ownerEmail: string,
): Promise<void> {
  const rows = await db.select().from(preAuthorizedApiKeys)
  const matching = rows.filter((row) => emailsInclude(row.emails, ownerEmail))
  if (matching.length === 0) return

  const llmVal: Record<string, unknown> = {
    defaultModel: null,
    defaultTemp: null,
  }

  for (const row of matching) {
    const body = row.providerBodyNoModels as
      | { apiKey?: string; [key: string]: unknown }
      | null
    if (!body || !row.providerName) continue
    if (typeof body.apiKey === 'string') {
      body.apiKey = await encryptKeyIfNeeded(body.apiKey)
    }
    llmVal[row.providerName] = body
  }

  const redis = await ensureRedisConnected()
  await redis.set(`${projectName}-llms`, JSON.stringify(llmVal))
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    project_name,
    project_description,
    project_owner_email,
    is_private,
    allow_logged_in_users,
  } = req.body

  if (!project_name || !project_owner_email) {
    return res.status(400).json({
      error: 'project_name and project_owner_email are required',
    })
  }

  try {
    const projectExists = await checkCourseExists(project_name)

    if (projectExists) {
      return res.status(409).json({
        error: 'Project name already exists',
        message: `A project with the name "${project_name}" already exists. Please choose a different name.`,
      })
    }
  } catch (error) {
    console.error('Error checking project name availability:', error)
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Unable to validate project name. Please contact support.',
    })
  }

  const seededMetadata: CourseMetadata = {
    is_private: Boolean(is_private),
    course_owner: project_owner_email,
    course_admins: superAdmins.length > 0 ? [...superAdmins] : [],
    approved_emails_list: [],
    example_questions: undefined,
    banner_image_s3: undefined,
    course_intro_message: undefined,
    openai_api_key: undefined,
    system_prompt: undefined,
    disabled_models: undefined,
    project_description: project_description || undefined,
    documentsOnly: undefined,
    disableCitations: undefined,
    guidedLearning: undefined,
    systemPromptOnly: undefined,
    vector_search_rewrite_disabled: undefined,
    allow_logged_in_users: Boolean(allow_logged_in_users),
    is_frozen: undefined,
  }

  try {
    await writeCourseMetadata(project_name, seededMetadata)

    try {
      await db.insert(projects).values({
        course_name: project_name,
        description: project_description || null,
        metadata_schema: DEFAULT_METADATA_SCHEMA,
      })
    } catch (projectErr) {
      console.error(
        `createProject: failed to insert projects row for ${project_name}`,
        projectErr,
      )
    }

    try {
      await seedPreAssignedLlmKeys(project_name, project_owner_email)
    } catch (llmErr) {
      console.error(
        `createProject: failed to seed pre-assigned LLM keys for ${project_name}`,
        llmErr,
      )
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error creating project:', error)
    return res.status(500).json({
      error: 'Internal server error while creating project',
    })
  }
}

export default withAuth(handler)
