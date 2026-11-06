export const MODELS_CACHE_TTL_SECONDS = 60

// Resolved provider/model lists from getModels; cleared when providers are saved.
export const modelsCacheKey = (projectName: string) =>
  `${projectName}-llms-resolved`
