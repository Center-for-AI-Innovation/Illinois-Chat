import { type streamText } from 'ai'

/** Convert SDK reasoning events to the plain-text format consumed by chat. */
export function toThinkingTextResponse(
  result: Pick<ReturnType<typeof streamText>, 'stream'>,
  { reasoningSeparator = '\n', trimStart = false } = {},
): Response {
  const encoder = new TextEncoder()
  const iterator = result.stream[Symbol.asyncIterator]()
  let thinking = false
  let hasContent = false

  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          while (true) {
            const { done, value: part } = await iterator.next()
            if (done) {
              if (thinking)
                controller.enqueue(
                  encoder.encode(`</think>${reasoningSeparator}`),
                )
              controller.close()
              return
            }
            if (part.type === 'error') throw part.error
            if (part.type === 'reasoning-delta') {
              controller.enqueue(
                encoder.encode(`${thinking ? '' : '<think>'}${part.text}`),
              )
              thinking = true
              return
            }
            if (part.type === 'text-delta') {
              const text =
                trimStart && !hasContent ? part.text.trimStart() : part.text
              hasContent ||= text.length > 0
              controller.enqueue(
                encoder.encode(
                  `${thinking ? `</think>${reasoningSeparator}` : ''}${text}`,
                ),
              )
              thinking = false
              return
            }
            if (part.type === 'reasoning-end' && thinking) {
              controller.enqueue(
                encoder.encode(`</think>${reasoningSeparator}`),
              )
              thinking = false
              return
            }
          }
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel() {
        await iterator.return?.()
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
