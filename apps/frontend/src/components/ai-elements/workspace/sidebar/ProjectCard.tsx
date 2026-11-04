'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { cn } from '@/components/shadcn/lib/utils'
import { FLAGSHIP_PROJECT, projectDisplayName } from '../projectName'

export interface ProjectCardProps {
  courseName: string
  description?: string
  bannerS3Path?: string
  dashboardUrl?: string
}

function useBannerUrl(courseName: string, s3Path?: string) {
  const { data } = useQuery({
    queryKey: ['bannerUrl', courseName, s3Path],
    enabled: courseName !== FLAGSHIP_PROJECT && Boolean(s3Path),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        s3_path: s3Path as string,
        course_name: courseName,
      })
      const res = await fetch(`/api/UIUC-api/getPresignedUrl?${params}`)
      if (!res.ok) throw new Error('Failed to fetch banner URL')
      return (await res.json()).presignedUrl as string
    },
  })
  return courseName === FLAGSHIP_PROJECT ? '/media/logo_illinois.png' : data
}

export function ProjectCard({
  courseName,
  description,
  bannerS3Path,
  dashboardUrl,
}: ProjectCardProps) {
  const banner = useBannerUrl(courseName, bannerS3Path)
  const name = projectDisplayName(courseName)
  const body = (
    <>
      {banner ? (
        <span className="relative size-16 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-(--ws-sidebar-border)">
          <Image
            src={banner}
            alt={courseName === FLAGSHIP_PROJECT ? 'Illinois logo' : ''}
            fill
            sizes="64px"
            className="object-contain"
          />
        </span>
      ) : (
        <span
          aria-hidden
          className="font-wsDisplay grid size-16 shrink-0 place-items-center rounded-md bg-(--ws-blue) text-2xl font-bold text-white uppercase dark:bg-(--ws-orange) dark:text-(--ws-blue)"
        >
          {name.trim().charAt(0) || '?'}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="font-wsDisplay line-clamp-3 text-base leading-[125%] font-bold text-(--ws-heading)">
          {name}
        </span>
        {description && (
          <span className="mt-1 line-clamp-2 text-sm leading-[145%] text-(--ws-muted)">
            {description}
          </span>
        )}
      </span>
      {dashboardUrl && (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg text-(--ws-muted) transition-colors group-hover:bg-(--ws-fill-hover) group-hover:text-(--ws-sidebar-accent-text)"
        >
          <Settings className="size-5 transition-transform duration-300 group-hover:rotate-45" />
        </span>
      )}
    </>
  )
  const className = 'flex w-full items-center gap-4 rounded-lg p-3 text-left'

  if (!dashboardUrl)
    return (
      <div className={className} title={description}>
        {body}
      </div>
    )
  return (
    <Link
      href={dashboardUrl}
      title={description || 'Open admin dashboard'}
      aria-label={`${name}, open admin dashboard`}
      className={cn(
        className,
        'group outline-offset-2 transition-[background-color,box-shadow] hover:bg-(--ws-raised) hover:shadow-(--ws-elevation)',
      )}
    >
      {body}
    </Link>
  )
}
