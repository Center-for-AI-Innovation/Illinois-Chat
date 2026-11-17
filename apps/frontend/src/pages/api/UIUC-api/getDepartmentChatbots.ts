import { chatbotsSectionHandler } from '~/utils/chatbotsSectionHandler'

/** Department-type chatbots the caller can access but doesn't own. */
export default chatbotsSectionHandler(
  { user: 'others', type: 'Department' },
  'department',
)
