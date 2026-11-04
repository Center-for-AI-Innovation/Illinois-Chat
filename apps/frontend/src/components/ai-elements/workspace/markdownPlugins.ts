import { createMermaidPlugin } from '@streamdown/mermaid'
import { type PluginConfig } from 'streamdown'

export const workspaceMarkdownPlugins: PluginConfig = {
  mermaid: createMermaidPlugin({
    config: {
      theme: 'base',
      fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
      themeVariables: {
        background: '#ffffff',
        primaryColor: '#ffffff',
        primaryBorderColor: '#13294b',
        primaryTextColor: '#13294b',
        secondaryColor: '#f4f4f4',
        secondaryBorderColor: '#707372',
        tertiaryColor: '#f4f4f4',
        tertiaryBorderColor: '#ff5f05',
        lineColor: '#707372',
        textColor: '#252525',
        clusterBkg: '#f4f4f4',
        clusterBorder: '#c6c7c6',
        noteBkgColor: '#f4f4f4',
        noteBorderColor: '#ff5f05',
        actorBkg: '#13294b',
        actorTextColor: '#ffffff',
        actorBorder: '#13294b',
        signalColor: '#252525',
      },
    },
  }),
}
