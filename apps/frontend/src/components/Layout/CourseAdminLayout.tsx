import React from 'react'
import { useRouter } from 'next/router'
import { useAuth } from 'react-oidc-context'
import { CannotEditCourse } from '~/components/UIUC-Components/CannotEditCourse'
import { CannotEditGPT4Page } from '~/components/UIUC-Components/CannotEditGPT4'
import { LoadingPlaceholderForAdminPages } from '~/components/UIUC-Components/MainPageBackground'
import { PermissionGate } from '~/components/UIUC-Components/PermissionGate'
import { RoleCheckFailed } from '~/components/UIUC-Components/RoleCheckFailed'
import { useFetchCourseRole } from '~/hooks/queries/useFetchCourseRole'
import { isNoContextProject } from '~/utils/projectName'

/**
 * Guards a project settings page so only the owner and admins can open it.
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
    if (status === 403) {
      return <CannotEditCourse course_name={courseName} />
    }
    return (
      <RoleCheckFailed
        course_name={courseName}
        onRetry={() => void role.refetch()}
      />
    )
  }

  if (role.data !== 'owner' && role.data !== 'admin') {
    return <CannotEditCourse course_name={courseName} />
  }

  return <>{children}</>
}
