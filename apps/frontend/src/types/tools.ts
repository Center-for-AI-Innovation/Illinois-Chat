export interface OpenAICompatibleTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters?: {
      type: 'object'
      properties: {
        [key: string]: {
          type: 'string' | 'number' | 'boolean'
          description?: string
          enum?: string[]
        }
      }
      required: string[]
    }
  }
}

export interface ToolParameter {
  type: 'string' | 'textarea' | 'number' | 'Date' | 'DropdownList' | 'boolean'
  description: string
  enum?: string[]
}
