export interface DownloadResult {
  message: string
}

export async function downloadConversationHistoryUser(
  userEmail: string,
  projectName: string,
): Promise<DownloadResult> {
  if (!userEmail || !projectName) {
    return { message: 'Missing email or project name.' }
  }

  try {
    const response = await fetch(
      `/api/UIUC-api/downloadConvoHistoryUser?projectName=${encodeURIComponent(projectName)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/zip, application/json, */*',
        },
      },
    )

    if (!response.ok) {
      let errorMessage = `Server error (${response.status})`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch {
        errorMessage = response.statusText || errorMessage
      }
      return { message: `Error: ${errorMessage}` }
    }

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const jsonData = await response.json()
      if (jsonData.response === 'Download from S3') {
        return {
          message:
            "We are gathering your large conversation history, you'll receive an email with a download link shortly.",
        }
      }
      if (jsonData.error) return { message: `Error: ${jsonData.error}` }
      return { message: 'Your conversation history is ready for download.' }
    }

    if (contentType.includes('application/zip')) {
      const blob = await response.blob()
      if (blob.size === 0) return { message: 'Error: Received empty file.' }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const sanitizedProjectName = projectName
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .substring(0, 10)
      link.setAttribute('download', `${sanitizedProjectName}-convos.zip`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      return { message: 'Downloading now, check your downloads.' }
    }

    return { message: 'Unexpected response format from server.' }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        message: 'Network error. Please check your connection and try again.',
      }
    }
    return { message: 'Error exporting documents. Please try again.' }
  }
}
