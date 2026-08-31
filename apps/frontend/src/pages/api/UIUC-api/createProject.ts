import { type NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '~/utils/authMiddleware'
import { checkCourseExists } from './getCourseExists'
import { writeCourseMetadata } from '~/utils/courseMetadataStore'
import type { CourseMetadata } from '~/types/courseMetadata'
import { db } from '~/db/dbClient'
import { preAuthorizedApiKeys, projects } from '~/db/schema'
import { encryptKeyIfNeeded } from '~/utils/crypto'
import { ensureRedisConnected } from '~/utils/redisClient'
import { isSuperAdmin, superAdmins } from '~/utils/superAdmins'
import { generateSchemaFromProjectDescription } from '~/utils/generateMetadataSchema'

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
    const body = row.providerBodyNoModels as {
      apiKey?: string
      [key: string]: unknown
    } | null
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
    project_owner_email: requested_owner_email,
    is_private,
    allow_logged_in_users,
  } = req.body

  if (!project_name) {
    return res.status(400).json({ error: 'project_name is required' })
  }

  // The owner is the authenticated caller, not whatever the body claims —
  // otherwise any signed-in user could create a project owned by someone else.
  // Super admins keep the ability to create a project on another user's behalf.
  const callerEmail = req.user?.email
  if (!callerEmail) {
    return res.status(401).json({ error: 'Unauthenticated' })
  }

  const project_owner_email =
    requested_owner_email && isSuperAdmin(callerEmail)
      ? requested_owner_email
      : callerEmail

  if (
    requested_owner_email &&
    requested_owner_email.toLowerCase() !== project_owner_email.toLowerCase()
  ) {
    console.warn(
      `createProject: ignoring project_owner_email "${requested_owner_email}" from non-super-admin ${callerEmail}`,
    )
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
      // Mirrors Flask `ProjectService.generate_json_schema`: the schema is
      // LLM-generated from the description, with a static fallback.
      const metadataSchema = await generateSchemaFromProjectDescription(
        project_name,
        project_description,
      )
      await db.insert(projects).values({
        course_name: project_name,
        description: project_description || null,
        metadata_schema: metadataSchema,
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
