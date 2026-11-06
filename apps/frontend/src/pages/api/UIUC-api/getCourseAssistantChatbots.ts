import { chatbotsSectionHandler } from '~/utils/chatbotsSectionHandler'

/** Course-type chatbots the caller can access but doesn't own. */
export default chatbotsSectionHandler(
  { user: 'others', type: 'Course' },
  'course assistant',
)
