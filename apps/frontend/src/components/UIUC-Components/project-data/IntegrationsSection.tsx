import { type Dispatch, type SetStateAction } from 'react'
import { IconLayoutGrid, IconLayoutRows } from '@tabler/icons-react'
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
import { IntegrationCardSizeContext } from './IntegrationCard'

export type IntegrationsLayout = 'gallery' | 'grid'

// Segmented Gallery/Grid control, rendered in the section heading row.
export function IntegrationsLayoutToggle({
  layout,
  onLayoutChange,
}: {
  layout: IntegrationsLayout
  onLayoutChange: (layout: IntegrationsLayout) => void
}) {
  return (
    <ToggleGroup
      // multiple={false} pins single-select; the guard below also drops the
      // empty selection a re-click of the active item would report.
      multiple={false}
      spacing={0.5}
      aria-label="Integrations layout"
      className="bg-background rounded-[10px] p-0.5"
      value={[layout]}
      onValueChange={(value) => {
        // Single-select: ignore the click that would clear the selection.
        const next = value[0] as IntegrationsLayout | undefined
        if (next) onLayoutChange(next)
      }}
    >
      <ToggleGroupItem
        value="gallery"
        className="aria-pressed:bg-accent h-9 gap-2 rounded-lg px-3"
      >
        <IconLayoutRows aria-hidden="true" />
        Gallery View
      </ToggleGroupItem>
      <ToggleGroupItem
        value="grid"
        className="aria-pressed:bg-accent h-9 gap-2 rounded-lg px-3"
      >
        <IconLayoutGrid aria-hidden="true" />
        Grid View
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function IntegrationsSection({
  layout,
  projectName,
  uploadFiles,
  setUploadFiles,
  queryClient,
}: {
  layout: IntegrationsLayout
  projectName: string
  uploadFiles: FileUpload[]
  setUploadFiles: Dispatch<SetStateAction<FileUpload[]>>
  queryClient: QueryClient
}) {
  return (
    <IntegrationCardSizeContext.Provider value="figma">
      <div className="flex flex-col gap-4">
        <div
          data-testid="integrations-list"
          data-layout={layout}
          className={cn(
            // Each form's wrapper is a flex box so its card fills the row height.
            '[&>*]:flex',
            layout === 'gallery'
              ? // Figma gallery (2574:10784): 349px cards, 29px gap, 12/32px padding.
                'flex gap-[29px] overflow-x-auto pt-3 pr-8 pb-8 [&>*]:min-w-[349px] [&>*]:shrink-0 [&>*]:basis-[349px]'
              : 'grid auto-rows-fr grid-cols-3 gap-6',
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
    </IntegrationCardSizeContext.Provider>
  )
}
