export const MIT_OCW_URL_PATTERN = /^https?:\/\/ocw\.mit\.edu\/.+/

export const MIT_INGEST_UNAVAILABLE_MESSAGE =
  'MIT OCW bulk ingest is temporarily unavailable. Please upload materials manually or use website scraping for individual pages.'

export function isValidMitOcwUrl(input: string): boolean {
  return MIT_OCW_URL_PATTERN.test(input)
}

export function notifyMitIngestUnavailable(): void {
  alert(MIT_INGEST_UNAVAILABLE_MESSAGE)
}
