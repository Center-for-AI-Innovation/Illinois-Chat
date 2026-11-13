import { Fragment } from 'react'
import { FileSpreadsheet } from 'lucide-react'

import { Separator } from '@/components/shadcn/ui/separator'
import { type CourseMetadata } from '~/types/courseMetadata'
import { PROJECT_DATA_SECTIONS } from './project-data.sections'

// Page shell: header plus the four section headings. The section bodies
// (upload, integrations, document groups, project files) are added by the
// following pages of the stack.
export function ProjectDataContent({
  projectName,
  courseMetadata,
}: {
  projectName: string
  courseMetadata?: CourseMetadata
}) {
  return (
    <div
      className="flex flex-col"
      data-project={projectName}
      data-metadata-loaded={courseMetadata ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2.5 pt-10 pr-14 pb-5 pl-10">
        <FileSpreadsheet aria-hidden="true" className="size-6" />
        <h1 className="text-foreground text-2xl leading-none font-semibold">
          Project Data
        </h1>
      </div>

      <div className="flex flex-col px-10 pt-6 pb-8">
        {PROJECT_DATA_SECTIONS.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <Separator className="my-10" />}
            <section
              aria-labelledby={section.id}
              className="flex flex-col gap-5"
            >
              <h2
                id={section.id}
                className="text-foreground scroll-mt-6 text-lg leading-7 font-semibold"
              >
                {section.title}
              </h2>
            </section>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
