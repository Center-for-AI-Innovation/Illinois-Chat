// Stub for Node-only builtins (net/tls/perf_hooks/async_hooks/fs/path) that must not resolve
// in the browser bundle. Webpack handles this via `resolve.fallback: false` and
// package.json's `browser` field; Turbopack honors neither, so next.config.mjs
// aliases these to this empty module under the `browser` condition.
// postgres/redis reach the client graph through shared modules but their Node
// paths never execute there. async_hooks is the server logger's request
// context (src/utils/server/requestContext.ts), which checks for the stub.
//
// Lives at the frontend root rather than under src/ because it is bundler
// configuration, not application code, and is never executed under test.
module.exports = {}
