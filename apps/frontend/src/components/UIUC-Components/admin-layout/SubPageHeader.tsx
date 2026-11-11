import Link from 'next/link'
import { X } from 'lucide-react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/shadcn/ui/breadcrumb'
import { buttonVariants } from '@/components/shadcn/ui/button'
import { Separator } from '@/components/shadcn/ui/separator'
import { SidebarTrigger } from '@/components/shadcn/ui/sidebar'
import { cn } from '@/components/shadcn/lib/utils'

// Figma sub-page "Header": sidebar toggle | separator | breadcrumb, with the
// panel's close (X) on the right.
export function SubPageHeader({
  courseName,
  breadcrumb = 'Project Settings',
}: {
  courseName: string
  breadcrumb?: string
}) {
  return (
    <header className="bg-background border-border flex h-16 shrink-0 items-center gap-2 border-b px-6">
      <SidebarTrigger />
      <Separator
        orientation="vertical"
        className="mx-1 data-[orientation=vertical]:h-[15px] data-[orientation=vertical]:self-center"
      />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumb}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Link
        href={`/${courseName}/chat`}
        aria-label="Close settings"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'ml-auto size-7 opacity-70 hover:opacity-100',
        )}
      >
        <X aria-hidden="true" />
      </Link>
    </header>
  )
}
