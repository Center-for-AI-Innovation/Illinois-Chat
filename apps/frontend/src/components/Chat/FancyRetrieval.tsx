import { Input } from '@mantine/core'
import { montserrat_paragraph } from 'fonts'
import { IconExternalLink } from '@tabler/icons-react'
import Link from 'next/link'
import { useMediaQuery } from '@mantine/hooks'

export const FancyRetrieval = () => {
  const isSmallScreen = useMediaQuery('(max-width: 960px)')

  return (
    <div
      className="flex h-full w-[100%] flex-col space-y-4 rounded-lg p-3"
      style={{ position: 'relative' }}
    >
      <div className="flex h-full flex-col space-y-4 rounded-lg p-2">
        <Input.Description
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
        </Input.Description>
      </div>
    </div>
  )
}
