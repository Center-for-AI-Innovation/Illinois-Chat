# Course-Based Role Authentication

This document explains how to use the course-based role checking functionality added to `authMiddleware.ts` to secure API endpoints based on user roles within specific courses.

## Overview

The system supports three levels of course access:

- **Course Owner**: The user who created the course (highest privileges)
- **Course Admin**: Users with administrative privileges for the course
- **Course Regular User**: Users with basic access to the course

Sitting outside those three is the **platform super admin**, a global role that
grants admin-level access to every project without appearing in any project's
metadata. See [Platform super admins](#platform-super-admins).

## Available Functions

### Role Checking Functions

```typescript
// Check if user is a course admin
isCourseAdmin(user: AuthenticatedUser, courseMetadata: CourseMetadata): boolean

// Check if user is the course owner
isCourseOwner(user: AuthenticatedUser, courseMetadata: CourseMetadata): boolean

// Check if user is an approved user for the course
isApprovedUser(user: AuthenticatedUser, courseMetadata: CourseMetadata): boolean

// Check if user has any access to the course (admin, owner, or approved user)
hasCourseAccess(user: AuthenticatedUser, courseMetadata: CourseMetadata): boolean

// Check if user is a regular user (not admin or owner) but has course access
isCourseRegularUser(user: AuthenticatedUser, courseMetadata: CourseMetadata): boolean
```

### Helper Functions

```typescript
// Get course metadata from Redis
getCourseMetadata(courseName: string): Promise<CourseMetadata | null>

// Extract course name from request (query params, body, or headers)
extractCourseName(req: NextApiRequest): string | null
```

## Middleware Functions

### 1. `withCourseAccess(courseName: string)`

Requires any level of access to the specified course.

```typescript
import { withCourseAccess } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Handler logic here
  // req.courseName will be set to the course name
}

export default withCourseAccess('my-course')(handler)
```

### 2. `withCourseAdminAccess(courseName: string)`

Requires admin or owner access to the specified course.

```typescript
import { withCourseAdminAccess } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Handler logic here
  // req.courseName will be set to the course name
}

export default withCourseAdminAccess('my-course')(handler)
```

### 3. `withCourseOwnerAccess(courseName: string)`

Requires owner access to the specified course.

```typescript
import { withCourseOwnerAccess } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Handler logic here
  // req.courseName will be set to the course name
}

export default withCourseOwnerAccess('my-course')(handler)
```

### 4. `withCourseAccessFromRequest(accessLevel: 'any' | 'admin' | 'owner')`

Automatically extracts course name from the request and applies the specified access level.

```typescript
import { withCourseAccessFromRequest } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Handler logic here
  // req.courseName will be set to the extracted course name
}

// For any course access
export default withCourseAccessFromRequest('any')(handler)

// For admin access
export default withCourseAccessFromRequest('admin')(handler)

// For owner access
export default withCourseAccessFromRequest('owner')(handler)
```

## Course Name Extraction

The `withCourseAccessFromRequest` middleware automatically looks for course names in the following order:

1. Query parameter: `?courseName=my-course`
2. Query parameter: `?course_name=my-course`
3. Request body: `{ "courseName": "my-course" }`
4. Request body: `{ "course_name": "my-course" }`
5. Header: `X-Course-Name: my-course`

## Usage Examples

### Example 1: Basic Course Access

```typescript
// pages/api/course-materials.ts
import { withCourseAccess, AuthenticatedRequest } from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // This endpoint is accessible to any user with access to the course
  return res.status(200).json({
    message: 'Course materials retrieved',
    courseName: req.courseName,
    user: req.user?.email,
  })
}

export default withCourseAccess('cs101')(handler)
```

### Example 2: Admin-Only Course Management

```typescript
// pages/api/course-settings.ts
import {
  withCourseAdminAccess,
  AuthenticatedRequest,
} from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // This endpoint is only accessible to course admins and owners
  return res.status(200).json({
    message: 'Course settings updated',
    courseName: req.courseName,
    admin: req.user?.email,
  })
}

export default withCourseAdminAccess('cs101')(handler)
```

### Example 3: Dynamic Course Access

```typescript
// pages/api/course-data.ts
import {
  withCourseAccessFromRequest,
  AuthenticatedRequest,
} from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Course name is extracted from the request automatically
  return res.status(200).json({
    message: 'Course data retrieved',
    courseName: req.courseName,
    user: req.user?.email,
  })
}

// Accessible via: GET /api/course-data?courseName=cs101
export default withCourseAccessFromRequest('any')(handler)
```

### Example 4: Owner-Only Operations

```typescript
// pages/api/delete-course.ts
import {
  withCourseOwnerAccess,
  AuthenticatedRequest,
} from '~/utils/authMiddleware'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Only the course owner can delete the course
  return res.status(200).json({
    message: 'Course deleted',
    courseName: req.courseName,
    owner: req.user?.email,
  })
}

export default withCourseOwnerAccess('cs101')(handler)
```

## Platform super admins

A platform super admin is granted admin-level access to every project by a live
check inside the middleware, not by being listed in any project's
`course_admins`.

### Why it is a live check

The obvious alternative — writing super-admin emails into each project's
`course_admins` when the project is created or saved — was how this used to
work, and it is a trap. `course_admins` is persisted project state, so a
revoked platform grant leaves project membership behind: the person loses the
`/admin` page but keeps admin rights on every project they were ever seeded
into, with nothing in the UI to indicate why. Revocation has to be complete to
mean anything, so the grant is resolved per request instead of being copied
into data.

Concretely, that means:

- `upsertCourseMetadata`, `setCourseMetadata`, `EmailListAccordion`, and
  `project_service.py` no longer seed or re-inject super admins.
- `EmailListAccordion` filters known platform admins out of the displayed
  admin list, because entries left over from the old behaviour represent a
  platform role rather than a project role.
- Those leftover entries are **not** cleaned up automatically. They are inert
  for authorization (the live check is what grants access) but they do remain
  in the stored metadata.

### Where the grant comes from

`isSuperAdminAsync(email)` in `~/utils/superAdmins.server` resolves the union of
two sources:

1. `SUPER_ADMIN_EMAILS` / `NEXT_PUBLIC_SUPER_ADMIN_EMAILS` — the env allowlist.
   This is the recovery floor: it keeps a Redis outage or a wiped key from
   locking everyone out, and it is only changeable through deployment config.
2. The `platform:super_admins` Redis set — grants added and removed through
   `/admin`.

If Redis is unreachable the check falls back to the env allowlist alone rather
than failing the request.

The module is server-only. `~/utils/superAdmins` (no `.server`) holds the
browser-safe env helpers and must stay free of Redis imports, since UI
components import it. Client code that needs the answer calls
`GET /api/admin/me` through `useFetchIsSuperAdmin`, so the UI agrees with what
the API will actually allow.

### Exactly what the bypass covers

Applied in both `src/pages/api/authorization.ts` and
`src/app/api/authorization.ts`:

| Gate                                    | Super admin bypasses? |
| --------------------------------------- | --------------------- |
| Authentication (401)                     | No                    |
| Missing project (404)                    | No                    |
| Frozen project (403)                     | No                    |
| Private-project access                   | Yes                   |
| `admin` tier                             | Yes                   |
| `owner` tier                             | No                    |

The owner tier is excluded deliberately: it guards destructive, single-owner
operations, and a platform role is not a claim of project ownership. In the App
Router module the check is memoized per request and only evaluated after a
normal check has already failed, so ordinary authorized traffic never pays for
the extra Redis read.

Listing and search surfaces (`getAllCourseMetadata`, `getAllCourseNames`,
`searchChatbots`) apply the same bypass, so a super admin's project list
matches what the authorization layer will let them open.

### Redis keys

| Key                     | Type | Contents                                                         |
| ----------------------- | ---- | ---------------------------------------------------------------- |
| `platform:super_admins` | set  | Lowercased emails granted super admin through `/admin`.          |
| `platform:settings`     | hash | Announcement banner record plus its audit fields.                |

Maintenance mode continues to use its existing keys; `PUT /api/admin/settings`
writes the banner field and the maintenance keys in a single `MULTI` so the two
cards cannot land half-applied.

### The /admin console

Three panels, all super-admin only: the announcement banner, maintenance mode,
and the super-admin roster on the Platform tab, and per-project connection
overrides on the Connections tab.

Two behaviours are worth knowing before touching it:

- **Maintenance mode does not lock out recovery.** `_app.tsx` keeps
  `KeycloakProvider` mounted during maintenance and swaps only the page
  content. That ordering is load-bearing: `redirect_uri` is the bare origin, so
  a fresh sign-in returns to `/` carrying `?code=&state=`, and the provider is
  what exchanges it. Gating above the provider would drop the code and lock out
  the operator who needs to turn maintenance off. `/admin` and `/silent-renew`
  are additionally exempt from the gate.
- **Turning the banner off clears the bar.** The precedence is three-way, not
  two-way: configured and enabled renders, configured and disabled renders
  nothing, and only absent, invalid, or unreadable falls through to the legacy
  `NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT` and rebranding banners. Collapsing
  "disabled" into "unconfigured" would make switching the banner off resurrect
  the old build-time one.

The home page is statically generated with `revalidate: 30`, and saving calls
`res.revalidate('/')` so the change usually appears immediately. Revalidation
is reported separately from the write, because it only regenerates the replica
that served the request and can fail on its own without the save being any less
durable.

### Known limitations

All of these are pre-existing. The super-admin bypass deliberately does not
change them.

- **Freezing a project is a one-way door, for everyone.** Two independent
  mechanisms combine. The `is_frozen` 403 fires ahead of the access check in
  every middleware, and each metadata-write route (`setCourseMetadata`,
  `upsertCourseMetadata`, `setCoursePublicOrPrivate`) is wrapped in
  `withCourseOwnerOrAdminAccess` — so once frozen, no API route can unfreeze
  it, not even for the owner. Separately, the listing filters drop frozen
  entries above the role check in `getAllCourseMetadata`, so a role-level
  bypass does not surface them either. Net effect: a frozen project disappears
  from every list and can only be recovered by editing Redis and Postgres by
  hand.
- **Super admins do not receive export emails.** `export_service.py` builds its
  recipient list from `course_admins`, which no longer contains platform
  admins. It appends `course_owner` and dedupes, so no project is left without
  a recipient, but a super admin stops receiving exports for projects they do
  not own.
- **Connection changes do not propagate instantly.** The Python backend keeps
  its own in-memory connection cache with a 30-minute TTL
  (`ai_ta_backend/database/connection_manager.py`), and the frontend
  `connectionManager` clears only its own process and Redis. A saved
  configuration is durable immediately, but in-flight workers may keep using
  the previous one for up to 30 minutes. The `/admin` connections UI states
  this bound where an operator will read it. Cross-process invalidation (Redis
  pub/sub) would remove the delay and is not implemented.
- **"Test saved connection" probes the stored config, not the form.** Secrets
  arrive masked, so there is nothing to probe unsaved edits with. The button is
  labelled accordingly and disabled while there are unsaved changes; testing
  unsaved values would need server-side merging into the probe path.

## Error Responses

The middleware returns appropriate HTTP status codes:

- **401 Unauthorized**: User not authenticated
- **403 Forbidden**: User doesn't have required access level
- **404 Not Found**: Course doesn't exist
- **400 Bad Request**: Course name not provided (for dynamic access)

## Course Metadata Structure

The system expects course metadata stored in Redis with the following structure:

```typescript
interface CourseMetadata {
  is_private: boolean
  course_owner: string // Email of course owner
  course_admins: string[] // Array of admin emails
  approved_emails_list: string[] // Array of approved user emails
  // ... other course properties
}
```

## Best Practices

1. **Use specific access levels**: Choose the most restrictive access level that still allows the functionality to work.

2. **Handle errors gracefully**: The middleware handles authentication and authorization errors, but you should handle business logic errors in your handlers.

3. **Log access attempts**: Consider logging access attempts for security auditing.

4. **Cache course metadata**: For high-traffic endpoints, consider caching course metadata to reduce Redis calls.

5. **Validate course names**: Ensure course names are properly validated and sanitized.

## Migration Guide

To migrate existing endpoints to use course-based authentication:

1. Import the appropriate middleware function
2. Wrap your handler with the middleware
3. Update your handler to use `req.courseName` if needed
4. Test with different user roles to ensure proper access control

```typescript
// Before
export default withAuth(handler)

// After
export default withCourseAccess('my-course')(handler)
// or
export default withCourseAccessFromRequest('admin')(handler)
```
