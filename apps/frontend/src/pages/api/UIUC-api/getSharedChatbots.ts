import { chatbotsSectionHandler } from '~/utils/chatbotsSectionHandler'

/** Private chatbots the caller was invited to, excluding Course and Department ones */
export default chatbotsSectionHandler(
  {
    user: 'others',
    visibility: 'private',
    excludeTypes: ['Course', 'Department'],
  },
  'shared',
)
