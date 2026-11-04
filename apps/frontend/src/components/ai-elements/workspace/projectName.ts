export const FLAGSHIP_PROJECT = 'chat'

export function projectDisplayName(courseName: string) {
  if (courseName === FLAGSHIP_PROJECT) return 'Illinois flagship chatbot'
  return courseName
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((word) =>
      /^[A-Z0-9]+$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ')
}
