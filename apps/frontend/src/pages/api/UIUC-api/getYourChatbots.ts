import { chatbotsSectionHandler } from '~/utils/chatbotsSectionHandler'

/** Chatbots the caller owns or admins, any privacy. */
export default chatbotsSectionHandler({ user: 'owned' }, 'your')
