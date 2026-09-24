import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { Switch } from '@/components/shadcn/ui/switch'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { ModelParams } from './ModelParams'
import { IconExternalLink } from '@tabler/icons-react'
import { useContext, useEffect, useState } from 'react'
import HomeContext from '~/components/home/home.context'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'

export const FancyRetrieval = () => {
  // Toggle to enable Fancy retrieval method: Multi-Query Retrieval
  const [useMQRetrieval, setUseMQRetrieval] = useState(
    localStorage.getItem('UseMQRetrieval') === 'true',
  )
  const {
    state: {
      selectedConversation,
      defaultModelId,
      // showModelSettings,
      prompts,
    },
    handleUpdateConversation,
    // dispatch: homeDispatch,
  } = useContext(HomeContext)

  const { t } = useTranslation('chat')
  const isSmallScreen = useMediaQuery('(max-width: 960px)')

  // Update localStorage whenever useMQRetrieval changes
  useEffect(() => {
    localStorage.setItem('UseMQRetrieval', useMQRetrieval ? 'true' : 'false')
  }, [useMQRetrieval])

  return (
    <>
      <div
        className="flex h-full w-full flex-col space-y-4 rounded-lg p-3"
        style={{ position: 'relative' }}
      >
        <Tooltip>
          <TooltipTrigger render={<div />}>
            {isSmallScreen ? (
              <h5
                className={`heading-h5 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4 text-(--modal-text)`}
              >
                Fancy Retrieval
              </h5>
            ) : (
              <h4
                className={`heading-h4 ${montserrat_heading.variable} font-montserratHeading rounded-lg bg-(--modal-dark) p-4 text-(--modal-text)`}
              >
                Fancy Retrieval
              </h4>
            )}
            <div className="mx-4 flex items-start gap-3 pt-2 pl-2">
              <Switch
                tabIndex={0}
                disabled
                checked={false}
                onCheckedChange={(checked) => setUseMQRetrieval(checked)}
              />
              <div>
                <span
                  className={`${
                    montserrat_paragraph.variable
                  } font-montserratParagraph ${isSmallScreen ? 'text-xs' : ''}`}
                >
                  {t('Multi Query Retrieval (slow 30 second response time)')}
                </span>
                <p
                  className={`${
                    montserrat_paragraph.variable
                  } font-montserratParagraph ${isSmallScreen ? 'text-xs' : ''}`}
                >
                  {t(
                    'A LLM generates multiple queries based on your original for improved semantic search. Then every retrieved context is filtered by a smaller LLM (Mistral 7b) so that only high quality and relevant documents are included in the final GPT-4 call.',
                  )}
                </p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            className={`${isSmallScreen ? 'text-xs' : 'text-sm'} bg-(--tooltip-background) text-(--tooltip) ${
              montserrat_paragraph.variable
            } font-montserratParagraph`}
            arrowClassName="bg-(--tooltip-background) fill-(--tooltip-background)"
          >
            Multi-Query Retrieval is disabled for performance reasons, I&apos;m
            working to bring it back ASAP.
          </TooltipContent>
        </Tooltip>
        {/* <ModelParams
          selectedConversation={selectedConversation}
          prompts={prompts}
          handleUpdateConversation={handleUpdateConversation}
          t={t}
        /> */}
        <div className="flex h-full flex-col space-y-4 rounded-lg p-2">
          <p
            className={`text-right ${isSmallScreen ? 'text-xs' : 'text-sm'} ${
              montserrat_paragraph.variable
            } font-montserratParagraph`}
          >
            <Link
              tabIndex={0}
              href="https://platform.openai.com/account/usage"
              target="_blank"
              className="hover:underline"
            >
              View account usage on OpenAI{' '}
              <IconExternalLink
                size={15}
                aria-hidden="true"
                style={{ position: 'relative', top: '2px' }}
                className={'mb-2 inline'}
              />
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
