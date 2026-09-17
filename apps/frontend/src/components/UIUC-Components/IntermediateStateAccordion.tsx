import React from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/shadcn/ui/accordion'
import { montserrat_paragraph } from 'fonts'
import { LoadingSpinner } from './LoadingSpinner'
import { IconChevronDown } from '@tabler/icons-react'

export const IntermediateStateAccordion = ({
  accordionKey,
  title,
  chevron,
  isLoading,
  error,
  content,
  disableChevronRotation,
  defaultValue,
}: {
  accordionKey: string
  title: React.ReactNode
  chevron?: React.ReactNode
  isLoading: boolean
  error: boolean
  content: React.ReactNode
  disableChevronRotation?: boolean
  defaultValue?: string
}) => {
  return (
    <div className="w-full">
      <Accordion
        className="w-full"
        defaultValue={defaultValue !== undefined ? [defaultValue] : []}
        keepMounted
      >
        <AccordionItem
          value={accordionKey}
          className="rounded-lg border-0"
          style={{
            color: 'var(--foreground)',
            backgroundColor: 'var(--background-faded)',
          }}
        >
          <AccordionTrigger
            className={`rounded-lg py-0 hover:bg-transparent hover:no-underline ${montserrat_paragraph.variable} font-montserratParagraph text-sm font-bold`}
            style={{
              textShadow: '0 0 0px' /* 10px */,
              color: 'var(--dashboard-foreground)',
            }}
            disabled={isLoading}
            icon={
              chevron ? (
                chevron
              ) : isLoading ? (
                <LoadingSpinner size="xs" />
              ) : (
                <IconChevronDown
                  aria-hidden="true"
                  className={
                    disableChevronRotation
                      ? undefined
                      : 'transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-90'
                  }
                />
              )
            }
          >
            {title}
          </AccordionTrigger>
          <AccordionContent
            className={`${
              montserrat_paragraph.variable
            } font-montserratParagraph rounded-lg bg-(--background-faded) pt-2 text-sm text-white ${
              error ? 'border-2 border-red-500' : ''
            }`}
          >
            <div style={{ position: 'relative' }}>
              <pre
                className="rounded-lg bg-(--background) p-2 pr-4 text-(--foreground)"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  maxHeight: '20em',
                  maxWidth: '100%',
                  overflowY: 'auto',
                }}
              >
                {content}
              </pre>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
