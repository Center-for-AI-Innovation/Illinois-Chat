import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'
import { FileSpreadsheet } from 'lucide-react'

import { Separator } from '@/components/shadcn/ui/separator'
import { type CourseMetadata } from '~/types/courseMetadata'
import UploadNotification from '../UploadNotification'
import { useUploadNotifications } from '~/hooks/useUploadNotifications'
import { DocumentUploadSection } from './DocumentUploadSection'
import {
  IntegrationsLayoutToggle,
  IntegrationsSection,
  type IntegrationsLayout,
} from './IntegrationsSection'
import { PROJECT_DATA_SECTIONS } from './project-data.sections'

// Page shell: header plus the four section headings. Only the upload body
// exists so far; integrations, document groups and project files follow in the
// next pages of the stack.
export function ProjectDataContent({
  projectName,
  courseMetadata,
}: {
  projectName: string
  courseMetadata?: CourseMetadata
}) {
  // Lives here so later section bodies (integrations) share the same list.
  const { uploadFiles, setUploadFiles, closeNotification } =
    useUploadNotifications()
  const queryClient = useQueryClient()
  // Local only: the choice is not persisted.
  const [integrationsLayout, setIntegrationsLayout] =
    useState<IntegrationsLayout>('gallery')

  const sectionBodies: Partial<Record<string, ReactNode>> = {
    'document-upload': (
      <DocumentUploadSection
        projectName={projectName}
        courseMetadata={courseMetadata}
        uploadFiles={uploadFiles}
        setUploadFiles={setUploadFiles}
      />
    ),
    integrations: (
      <IntegrationsSection
        layout={integrationsLayout}
        projectName={projectName}
        uploadFiles={uploadFiles}
        setUploadFiles={setUploadFiles}
        queryClient={queryClient}
      />
    ),
  }

  const sectionActions: Partial<Record<string, ReactNode>> = {
    integrations: (
      <IntegrationsLayoutToggle
        layout={integrationsLayout}
        onLayoutChange={setIntegrationsLayout}
      />
    ),
  }

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
              <div className="flex items-center justify-between gap-4">
                <h2
                  id={section.id}
                  className="text-foreground scroll-mt-6 text-lg leading-7 font-semibold"
                >
                  {section.title}
                </h2>
                {sectionActions[section.id]}
              </div>
              {sectionBodies[section.id]}
            </section>
          </Fragment>
        ))}
      </div>
      <UploadNotification
        files={uploadFiles}
        onClose={closeNotification}
        projectName={projectName}
      />
    </div>
  )
}
