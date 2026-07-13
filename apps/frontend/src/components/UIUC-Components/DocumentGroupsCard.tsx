import { IconInfoCircle } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useResponsiveCardWidth } from '~/utils/responsiveGrid'
import { DocGroupsTable } from './DocGroupsTable'

function DocumentGroupsCard({
  course_name,
  sidebarCollapsed = false,
}: {
  course_name: string
  sidebarCollapsed?: boolean
}) {
  const [accordionOpened, setAccordionOpened] = useState(false)

  // Get responsive card width classes based on sidebar state
  const cardWidthClasses = useResponsiveCardWidth(sidebarCollapsed || false)

  return (
    <div
      className={`mt-[2%] ${cardWidthClasses} overflow-hidden rounded-[2rem] border`}
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--dashboard-border)',
      }}
    >
      <div
        style={{
          color: 'white',
        }}
        className="min-h-full bg-[--background]"
      >
        <div className="w-full border-b border-[--dashboard-border] px-4 py-3 sm:px-6 sm:py-4 md:px-8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3
                className={`${montserrat_heading.variable} font-montserratHeading text-lg font-bold text-[--foreground] sm:text-2xl`}
              >
                Document Groups
              </h3>
              <button
                type="button"
                onClick={() => setAccordionOpened(!accordionOpened)}
                title="More info on document groups"
                className="inline-flex items-center justify-center rounded-md p-1 hover:bg-[--background]"
              >
                <IconInfoCircle
                  className="text-[--foreground-faded] hover:text-[--foreground]"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[--background] px-4 py-4 sm:px-6 sm:py-6 md:px-8">
          <AnimatePresence>
            {accordionOpened && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="mb-6 overflow-hidden"
              >
                <div className="flex bg-[--background-faded]">
                  <div className="w-1 bg-[--illinois-orange]" />
                  <div
                    className={`${montserrat_paragraph.variable} mb-4 flex-1 p-4 font-montserratParagraph`}
                  >
                    <p
                      className={`${montserrat_paragraph.variable} mb-4 font-montserratParagraph text-[--foreground]`}
                    >
                      Document Groups help you organize and control your
                      content:
                    </p>
                    <ul className="list-inside list-disc space-y-2 text-[--foreground]">
                      <li className="text-sm">
                        <span className="text-[--illinois-orange]">
                          Organize
                        </span>{' '}
                        documents into clear categories
                      </li>
                      <li className="text-sm">
                        <span className="text-[--illinois-orange]">
                          Enable/disable
                        </span>{' '}
                        groups to control visibility
                      </li>
                      <li className="text-sm">
                        <span className="text-[--illinois-orange]">
                          Filter chats
                        </span>{' '}
                        to specific document groups
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <DocGroupsTable course_name={course_name} />
        </div>
      </div>
    </div>
  )
}

export default DocumentGroupsCard
