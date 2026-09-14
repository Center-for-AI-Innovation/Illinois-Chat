import { useCallback, useContext, useEffect, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/shadcn/ui/tabs'
import { Separator } from '@/components/shadcn/ui/separator'
import HomeContext from '~/components/home/home.context'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import React from 'react'
import { ModelSelect } from './ModelSelect'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { FancyRetrieval } from './FancyRetrieval'
import { DocumentGroupsItem } from './DocumentGroupsItem'
import { ToolsItem } from './ToolsItem'
import { ModelParams } from './ModelParams'
import { useTranslation } from 'react-i18next'
import { prebuiltAppConfig } from '~/utils/modelProviders/ConfigWebLLM'
import * as webllm from '@mlc-ai/web-llm'
import { type WebllmModel, webLLMModels } from '~/utils/modelProviders/WebLLM'
import { XIcon } from 'lucide-react'

export const modelCached: WebllmModel[] = []

const appConfig = prebuiltAppConfig
// CHANGE THIS TO SEE EFFECTS OF BOTH, CODE BELOW DO NOT NEED TO CHANGE
appConfig.useIndexedDBCache = false
// if (appConfig.useIndexedDBCache) {
//   console.debug('WebLLM: Using IndexedDB Cache')
// } else {
//   console.debug('WebLLM: Using Cache API')
// }

export const UserSettings = () => {
  const {
    state: { selectedConversation, prompts, showModelSettings },
    handleUpdateConversation,
    dispatch: homeDispatch,
  } = useContext(HomeContext)

  const { t } = useTranslation('chat')
  const [opened, setOpened] = useState(false)
  const open = useCallback(() => setOpened(true), [])
  const close = useCallback(() => setOpened(false), [])
  const isSmallScreen = useMediaQuery('(max-width: 960px)')
  const loadModelCache = async () => {
    for (const model of webLLMModels) {
      const theCachedModel = await webllm.hasModelInCache(model.name, appConfig)
      if (theCachedModel) {
        if (
          !modelCached.some((cachedModel) => cachedModel.name === model.name)
        ) {
          modelCached.push(model)
        }
      }
      // console.log('hasModelInCache: ', modelCached)
    }
  }

  useEffect(() => {
    if (showModelSettings) {
      open()
      // console.log('model cached', modelCached)
      loadModelCache()
    } else {
      close()
    }
  }, [showModelSettings, open, close, loadModelCache])

  const handleClose = () => {
    homeDispatch({ field: 'showModelSettings', value: false })
  }

  const tabTriggerClass = `${isSmallScreen ? 'px-2 text-xs' : 'text-md'} ${montserrat_paragraph.variable} font-montserratParagraph text-(--modal-text) justify-start data-active:bg-(--modal-active) hover:bg-(--modal-active) hover:text-white data-active:text-white whitespace-normal`

  return (
    <Dialog open={opened} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        data-settings-modal
        showCloseButton={false}
        className={`h-[95%] w-[90%] max-w-[800px] gap-0 overflow-hidden rounded-[.25rem] bg-(--modal) text-(--modal-text) md:rounded-lg ${isSmallScreen ? 'p-2' : 'p-4'}`}
      >
        <div className="flex w-full items-center justify-between rounded-lg bg-(--modal-dark)">
          <DialogTitle
            className={`font-bold ${montserrat_heading.variable} font-montserratHeading`}
          >
            Settings
          </DialogTitle>
          <DialogClose
            onClick={handleClose}
            aria-label="Close settings"
            className="text-(--foreground-faded) hover:text-(--foreground)"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>
        <div
          data-settings-modal-body
          className={`mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${isSmallScreen ? 'p-2' : 'p-4'}`}
        >
          <Tabs orientation="vertical" defaultValue="model">
            <div className="flex gap-2">
              <TabsList
                className={`mt-6 ml-2 h-fit flex-col bg-transparent ${isSmallScreen ? 'w-1/4' : 'w-auto'}`}
              >
                <TabsTrigger value="model" className={tabTriggerClass}>
                  Model
                </TabsTrigger>
                <TabsTrigger
                  value="documentGroups"
                  className={tabTriggerClass}
                >
                  Document Groups
                </TabsTrigger>
                <TabsTrigger value="tools" className={tabTriggerClass}>
                  Tools
                </TabsTrigger>
              </TabsList>

              <Separator orientation="vertical" className="ml-2" />

              <div className="flex-1">
                <TabsContent value="model" className="pt-2">
                  <div className="flex flex-col">
                    <ModelSelect />
                    <Separator
                      className={`my-2 self-center ${isSmallScreen ? 'w-[70%]' : 'w-[90%]'}`}
                    />
                    <ModelParams
                      selectedConversation={selectedConversation}
                      prompts={prompts}
                      handleUpdateConversation={handleUpdateConversation}
                      t={t}
                    />
                    <Separator
                      className={`my-2 self-center ${isSmallScreen ? 'w-[70%]' : 'w-[90%]'}`}
                    />
                    <FancyRetrieval />
                  </div>
                </TabsContent>

                <TabsContent value="documentGroups" className="pt-2">
                  <DocumentGroupsItem />
                </TabsContent>

                <TabsContent value="tools" className="pt-2">
                  <ToolsItem />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
