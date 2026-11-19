import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'
import { CannotEditCourse } from '~/components/UIUC-Components/CannotEditCourse'
import { CourseIsFrozen } from '~/components/UIUC-Components/CourseIsFrozen'
import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { RoleCheckFailed } from '~/components/UIUC-Components/RoleCheckFailed'
import { useFetchCourseRole } from '~/hooks/queries/useFetchCourseRole'
import { isNoContextProject } from '~/utils/projectName'

/**
 * Guards a project settings page so only the owner, admins and platform
 * super admins can open it.
 * Applied through `Page.getLayout` in `_app`, so the page's own components
 * (which fetch data on mount) only mount once the role is confirmed.
 */
export default function CourseAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const auth = useAuth()

  const raw = router.query.course_name
  const courseName =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : ''
  const noContext = courseName !== '' && isNoContextProject(courseName)

  const role = useFetchCourseRole({
    courseName,
    enabled: router.isReady && auth.isAuthenticated && !noContext,
  })

  // A 401 can mean the cookie expired before silent renew; re-check once a new token arrives
  const token = auth.user?.access_token
  const roleRef = useRef(role)
  roleRef.current = role
  const prevToken = useRef(token)
  useEffect(() => {
    if (token === prevToken.current) return
    prevToken.current = token
    const current = roleRef.current
    if (!current.isLoadingError || current.error.status !== 401) return
    // AuthCookie, a parent, writes the new cookie in an effect that runs after this one
    const id = setTimeout(() => void current.refetch(), 0)
    return () => clearTimeout(id)
  }, [token])

  if (!router.isReady || auth.isLoading || courseName === '') {
    return <LoadingPlaceholderForAdminPages />
  }

  if (!auth.isAuthenticated) {
    return <PermissionGate course_name={courseName} />
  }

  if (noContext) {
    return <CannotEditGPT4Page course_name={courseName} />
  }

  if (role.isPending) {
    return <LoadingPlaceholderForAdminPages />
  }

  // Only a failed first load blocks; a failed refetch keeps the confirmed role
  if (role.isLoadingError) {
    const status = role.error.status
    if (status === 401) {
      return <PermissionGate course_name={courseName} />
    }
    if (status === 404) {
      return <PermissionGate course_name={courseName} errorType={404} />
    }
    // The role endpoint only returns 403 for a frozen project
    if (status === 403) {
      return <CourseIsFrozen course_name={courseName} />
    }
    return (
      <RoleCheckFailed
        course_name={courseName}
        onRetry={() => void role.refetch()}
      />
    )
  }

  if (
    role.data !== 'owner' &&
    role.data !== 'admin' &&
    role.data !== 'super_admin'
  ) {
    return <CannotEditCourse course_name={courseName} />
  }

  return <>{children}</>
}
