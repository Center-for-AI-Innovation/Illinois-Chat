import { useMutation, useQueryClient } from '@tanstack/react-query'

async function deleteScrapeRun(
  courseName: string,
  id: string,
  deleteFiles: boolean,
): Promise<void> {
  const params = new URLSearchParams({ course_name: courseName, id })
  if (deleteFiles) params.append('delete_files', 'true')

  const response = await fetch(`/api/scrapeRuns?${params.toString()}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(`Error deleting scrape run: ${response.status}`)
  }
}

// Deletes a saved scrape (scraping_metadata_run row) and refreshes the
// project's suggestion list. `mutate({ id, deleteFiles })`: when deleteFiles is
// true the scrape's documents (S3 + vectors + rows) are deleted too, so the
// documents and document-group caches are invalidated as well.
export function useDeleteScrapeRun({ courseName }: { courseName: string }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      deleteScrapeRun(courseName, id, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrapeRuns', courseName] })
      queryClient.invalidateQueries({ queryKey: ['documents', courseName] })
      queryClient.invalidateQueries({
        queryKey: ['documentGroups', courseName],
      })
    },
  })
}
