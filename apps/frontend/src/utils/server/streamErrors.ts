// Failures of a chat reply after it has started. The status is 200 by then,
// so the log is the one place that can say what went wrong.
// Server-only by convention.
import type { LogFields, Logger } from './log'
import { getLogContext, runWithLogContext } from './requestContext'

// Tells a reader that went away from a provider that failed.
//
// When the browser closes the chat reply (the user stops it, or leaves the
// page), the next controller.enqueue() or controller.close() of a stream
// throws "Invalid state: Controller is already closed", and an aborted fetch
// gives an AbortError. That is not a failure of the server and can happen for
// every remaining token, so it must not be written as an ERROR.
// Node uses the code ERR_INVALID_STATE for other wrong states of a stream too
// (a locked stream, a released reader): those are bugs and are not matched.
export function isClosedStreamError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, name, message } = error as {
    code?: unknown
    name?: unknown
    message?: unknown
  }
  if (name === 'AbortError') return true
  return code === 'ERR_INVALID_STATE' && /already closed/i.test(String(message))
}

// Passes a streamed reply on and writes one ERROR line when reading it fails.
//
// streamText of the AI SDK calls onError for an error that the provider
// sends as part of its stream. It does not call it when the connection to the
// provider breaks in the middle of the reply (undici: "terminated"): then the
// read of the body throws, the client gets a broken 200, and nothing is
// logged. This wrapper is the place that sees that read fail.
// The request context (rid, path, course) is taken now, because the reads
// happen later, outside it.
export function logStreamFailure(
  response: Response,
  log: Logger,
  fields?: LogFields,
): Response {
  if (!response.body) return response
  const reader = response.body.getReader()
  const context = getLogContext()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        if (!isClosedStreamError(error)) {
          const write = () => log.error('LLM stream failed', fields, error)
          if (context) runWithLogContext(context, write)
          else write()
        }
        controller.error(error)
      }
    },
    // The reader of the reply went away: stop reading from the provider, as
    // the unwrapped stream did.
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
