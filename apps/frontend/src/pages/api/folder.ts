import { type NextApiResponse } from 'next'
import { type AuthenticatedRequest } from '~/utils/authMiddleware'
import { db, folders, conversations, messages, projects } from '~/db/dbClient'
import { type FolderWithConversation } from '@/types/folder'
import { type Database } from 'database.types'
import { convertDBToChatConversation } from './conversation'
import { type NewFolders } from '~/db/schema'
import { eq, desc, and, or, ilike, inArray } from 'drizzle-orm'

/**
 * Resolve a course name to its `projects.id`, which is what folders are keyed
 * by. Projects are inserted before a project goes live, so a course the caller
 * is authorized for always has a row.
 */
async function resolveProjectId(courseName: string): Promise<number | null> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.course_name, courseName))
    .orderBy(projects.id)
    .limit(1)

  return project?.id ?? null
}
import { withCourseAccessFromRequest } from '~/server/authorization'
import { getUserIdentifier } from '~/server/userIdentifier'

type Folder = Database['public']['Tables']['folders']['Row']

export function convertDBFolderToChatFolder(
  dbFolder: Folder,
  dbConversations: any[],
): FolderWithConversation {
  return {
    id: dbFolder.id,
    name: dbFolder.name,
    type: dbFolder.type as 'chat' | 'prompt',
    conversations: (dbConversations || []).map((conv) => {
      const convMessages = conv.messages
      return convertDBToChatConversation(conv, convMessages)
    }),
    createdAt: dbFolder.created_at || new Date().toISOString(),
    updatedAt: dbFolder.updated_at || new Date().toISOString(),
  }
}

export default withCourseAccessFromRequest('any')(handler)

export function convertChatFolderToDBFolder(
  folder: FolderWithConversation,
  email: string,
  projectId: number,
): NewFolders {
  return {
    id: folder.id,
    name: folder.name,
    type: folder.type.toString(),
    user_email: email,
    project_id: projectId,
    created_at: new Date(folder.createdAt || new Date()),
    updated_at: new Date(),
  }
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { method } = req
  const userIdentifier = getUserIdentifier(req)
  // Resolved and authorized by withCourseAccessFromRequest (query or body).
  const courseName = req.courseName
  if (!userIdentifier) {
    return res.status(400).json({
      error: 'No valid user identifier provided',
      message:
        'Cannot perform folder operation without a valid user identifier',
    })
  }

  switch (method) {
    case 'POST':
      if (!courseName) {
        return res
          .status(400)
          .json({ error: 'courseName is required to save a folder' })
      }

      const { folder }: { folder: FolderWithConversation } = req.body

      try {
        const projectId = await resolveProjectId(courseName)
        if (projectId === null) {
          return res
            .status(404)
            .json({ error: `Project '${courseName}' does not exist` })
        }

        //   Convert folder to DB type
        const dbFolder = convertChatFolderToDBFolder(
          folder,
          userIdentifier,
          projectId,
        )

        // Insert or update folder using DrizzleORM. project_id is deliberately
        // left out of the update: renaming a folder must not move it to
        // whichever course the caller happens to be viewing.
        const saved = await db
          .insert(folders)
          .values(dbFolder)
          .onConflictDoUpdate({
            target: folders.id,
            set: {
              name: dbFolder.name,
              type: dbFolder.type,
              updated_at: new Date(),
            },
            where: eq(folders.user_email, userIdentifier),
          })
          .returning({ id: folders.id })

        if (saved.length === 0) {
          return res
            .status(403)
            .json({ error: 'Not allowed to modify this folder' })
        }

        res.status(200).json({ message: 'Folder saved successfully' })
      } catch (error) {
        console.error('Error saving folder:', error)
        res.status(500).json({
          error: `Failed to save folder: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      }
      break

    case 'GET':
      if (!courseName) {
        return res
          .status(400)
          .json({ error: 'courseName query parameter is required' })
      }
      try {
        const searchTerm = req.query.searchTerm as string
        const searchPattern =
          searchTerm && searchTerm.trim() !== '' ? `%${searchTerm}%` : undefined

        const projectId = await resolveProjectId(courseName)
        if (projectId === null) {
          return res
            .status(404)
            .json({ error: `Project '${courseName}' does not exist` })
        }

        // Query folders and their related conversations and messages using DrizzleORM

        // conversations matching by name or message content
        const matchingConversationIds = db
          .selectDistinct({
            id: conversations.id,
          })
          .from(conversations)
          .leftJoin(messages, eq(messages.conversation_id, conversations.id))
          .where(
            and(
              eq(conversations.user_email, userIdentifier),
              eq(conversations.project_name, courseName),
              or(
                ilike(conversations.name, searchPattern!),
                ilike(messages.content_text, searchPattern!),
              ),
            ),
          )

        // folders matching by folder name
        const matchingFolderIds = db
          .select({
            id: folders.id,
          })
          .from(folders)
          .where(
            and(
              eq(folders.user_email, userIdentifier),
              eq(folders.project_id, projectId),
              ilike(folders.name, searchPattern!),
            ),
          )

        const fetchedFolders = await db.query.folders.findMany({
          where: and(
            eq(folders.user_email, userIdentifier),
            // Folders belong to exactly one project. Pre-0018 rows with a NULL
            // project_id belong to none and are never listed.
            eq(folders.project_id, projectId),
            searchPattern
              ? or(
                  // folder matched directly
                  inArray(folders.id, matchingFolderIds),

                  // folder has matching conversations
                  inArray(
                    folders.id,
                    db
                      .select({
                        id: conversations.folder_id,
                      })
                      .from(conversations)
                      .where(
                        and(
                          eq(conversations.user_email, userIdentifier),
                          eq(conversations.project_name, courseName),
                          inArray(conversations.id, matchingConversationIds),
                        ),
                      ),
                  ),
                )
              : undefined,
          ),
          orderBy: desc(folders.created_at),
          with: {
            conversations: {
              where: and(
                eq(conversations.user_email, userIdentifier),
                eq(conversations.project_name, courseName),
                searchPattern
                  ? or(
                      // if folder matched -> include all conversations
                      inArray(conversations.folder_id, matchingFolderIds),

                      // otherwise only matching conversations
                      inArray(conversations.id, matchingConversationIds),
                    )
                  : undefined,
              ),
              with: {
                messages: {
                  columns: {
                    id: true,
                    role: true,
                    content_text: true,
                    content_image_url: true,
                    image_description: true,
                    contexts: true,
                    tools: true,
                    latest_system_message: true,
                    final_prompt_engineered_message: true,
                    response_time_sec: true,
                    updated_at: true,
                    feedback_is_positive: true,
                    feedback_category: true,
                    feedback_details: true,
                    was_query_rewritten: true,
                    query_rewrite_text: true,
                    processed_content: true,
                    conversation_id: true,
                    created_at: true,
                  },
                },
              },
              columns: {
                id: true,
                name: true,
                model: true,
                prompt: true,
                temperature: true,
                folder_id: true,
                user_email: true,
                project_name: true,
              },
            },
          },
        })

        // Convert the fetched data to match the expected format
        const formattedFolders = fetchedFolders.map((folder) => {
          const conversations = folder.conversations || []
          // Convert Date objects to ISO strings before passing to convertDBFolderToChatFolder
          const folderWithStringDates = {
            ...folder,
            created_at: folder.created_at.toISOString(),
            updated_at: folder.updated_at?.toISOString() || null,
          }
          return convertDBFolderToChatFolder(
            folderWithStringDates,
            conversations,
          )
        })

        res.status(200).json(formattedFolders)
      } catch (error) {
        res.status(500).json({ error: 'Error fetching folders' })
        console.error('Error fetching folders:', error)
      }
      break
    case 'DELETE':
      const { deletedFolderId } = req.body as {
        deletedFolderId: string
      }
      try {
        // Delete folder
        if (deletedFolderId && userIdentifier) {
          const deleted = await db
            .delete(folders)
            .where(
              and(
                eq(folders.id, deletedFolderId),
                eq(folders.user_email, userIdentifier),
              ),
            )
            .returning({ id: folders.id })

          if (deleted.length === 0) {
            return res
              .status(403)
              .json({ error: 'Not allowed to delete this folder' })
          }
          res.status(200).json({ message: 'Folder deleted successfully' })
        } else {
          res.status(400).json({
            error: 'Invalid user identifier or invalid request parameters',
          })
          return
        }
      } catch (error) {
        res.status(500).json({ error: 'Error deleting folder' })
        console.error('Error deleting folder:', error)
      }
      break

    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
