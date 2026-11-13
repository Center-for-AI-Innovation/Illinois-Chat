import { FileSpreadsheet } from 'lucide-react'

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
      className="flex flex-col gap-8 p-6"
      data-project={projectName}
      data-metadata-loaded={courseMetadata ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheet aria-hidden="true" className="size-6" />
        <h1 className="text-foreground text-2xl leading-8 font-bold">
          Project Data
        </h1>
      </div>

      {PROJECT_DATA_SECTIONS.map((section) => (
        <section
          key={section.id}
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
      ))}
    </div>
  )
}
