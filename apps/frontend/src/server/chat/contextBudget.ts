import { encodingForModel } from 'js-tiktoken'
import { type ModelMessage } from 'ai'
import { type WorkspaceSource } from '~/types/workspace'

const encoding = encodingForModel('gpt-4o')

export const countTokens = (text: string) => encoding.encode(text).length

export const messagesTokens = (messages: ModelMessage[]) =>
  messages.reduce(
    (sum, message) => sum + countTokens(JSON.stringify(message.content)),
    0,
  )

// Tool calls and their results must stay together, so history is only ever
// trimmed in whole turns, each starting at a user message.
function turns(messages: ModelMessage[]) {
  const grouped: ModelMessage[][] = []
  for (const message of messages) {
    if (message.role === 'user' || !grouped.length) grouped.push([message])
    else grouped.at(-1)!.push(message)
  }
  return grouped
}

// Same reservations as the legacy prompt builder (buildPromptUtils): 1,500
// tokens of headroom and the instructions.
export function promptBudget(tokenLimit: number, instructions: string) {
  return Math.max(0, tokenLimit - 1500 - countTokens(instructions))
}

// Like the legacy builder, passages are sized against the latest exchange
// counted twice, before older history competes for the remaining room.
export function passageBudget(budget: number, history: ModelMessage[]) {
  return Math.max(0, budget - messagesTokens(turns(history).at(-1) ?? []) * 2)
}

export function fitHistory(history: ModelMessage[], budget: number) {
  const grouped = turns(history)
  const kept: ModelMessage[][] = []
  let tokens = 0
  for (const [index, turn] of [...grouped].reverse().entries()) {
    const cost = messagesTokens(turn)
    if (index > 0 && tokens + cost > budget) break
    kept.unshift(turn)
    tokens += cost
  }
  return { messages: kept.flat(), tokens }
}

export function fitSources(sources: WorkspaceSource[], budget: number) {
  let tokens = 0
  const kept: WorkspaceSource[] = []
  for (const source of sources) {
    const cost = countTokens(JSON.stringify(source))
    if (tokens + cost > budget) continue
    tokens += cost
    kept.push(source)
  }
  return { sources: kept, tokens }
}
