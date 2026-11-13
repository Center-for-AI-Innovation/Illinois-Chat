import { useState, type Dispatch, type SetStateAction } from 'react'
import { type QueryClient } from '@tanstack/react-query'

import { cn } from '@/components/shadcn/lib/utils'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/shadcn/ui/toggle-group'
import CanvasIngestForm from '../CanvasIngestForm'
import CourseraIngestForm from '../CourseraIngestForm'
import GitHubIngestForm from '../GitHubIngestForm'
import MITIngestForm from '../MITIngestForm'
import WebsiteIngestForm from '../WebsiteIngestForm'
import { type FileUpload } from '../UploadNotification'

type IntegrationsLayout = 'gallery' | 'grid'

export function IntegrationsSection({
  projectName,
  uploadFiles,
  setUploadFiles,
  queryClient,
}: {
  projectName: string
  uploadFiles: FileUpload[]
  setUploadFiles: Dispatch<SetStateAction<FileUpload[]>>
  queryClient: QueryClient
}) {
  const [layout, setLayout] = useState<IntegrationsLayout>('gallery')

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        // multiple={false} pins single-select; the guard below also drops the
        // empty selection a re-click of the active item would report.
        multiple={false}
        variant="outline"
        spacing={0}
        aria-label="Integrations layout"
        value={[layout]}
        onValueChange={(value) => {
          // Single-select: ignore the click that would clear the selection.
          const next = value[0] as IntegrationsLayout | undefined
          if (next) setLayout(next)
        }}
      >
        <ToggleGroupItem value="gallery" aria-label="Gallery view">
          Gallery
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label="Grid view">
          Grid
        </ToggleGroupItem>
      </ToggleGroup>
      <div
        data-testid="integrations-list"
        data-layout={layout}
        className={cn(
          // Each form's wrapper is a flex box so its card fills the row height.
          '[&>*]:flex',
          layout === 'gallery'
            ? 'flex gap-4 overflow-x-auto pb-2 [&>*]:w-72 [&>*]:shrink-0'
            : 'grid auto-rows-fr grid-cols-3 gap-4',
        )}
      >
        <CanvasIngestForm
          project_name={projectName}
          setUploadFiles={setUploadFiles}
          queryClient={queryClient}
        />
        <WebsiteIngestForm
          project_name={projectName}
          uploadFiles={uploadFiles}
          setUploadFiles={setUploadFiles}
          queryClient={queryClient}
        />
        <GitHubIngestForm
          project_name={projectName}
          uploadFiles={uploadFiles}
          setUploadFiles={setUploadFiles}
          queryClient={queryClient}
        />
        <MITIngestForm
          project_name={projectName}
          setUploadFiles={setUploadFiles}
          queryClient={queryClient}
        />
        {/* Coursera is deliberately stateless: it takes no props. */}
        <CourseraIngestForm />
      </div>
    </div>
  )
}
