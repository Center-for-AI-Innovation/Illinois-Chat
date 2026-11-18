// Tells a reader that went away from a provider that failed.
//
// When the browser closes the chat reply (the user stops it, or leaves the
// page), the next controller.enqueue() or controller.close() of a stream
// throws "Invalid state: Controller is already closed", and an aborted fetch
// gives an AbortError. That is not a failure of the server and can happen for
// every remaining token, so it must not be written as an ERROR.
// Server-only by convention.
export function isClosedStreamError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, name } = error as { code?: unknown; name?: unknown }
  return code === 'ERR_INVALID_STATE' || name === 'AbortError'
}
