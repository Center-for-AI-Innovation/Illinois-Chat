import React from 'react'
import {
  IconFileTypePdf,
  IconFileTypeDocx,
  IconFileTypePpt,
  IconFileTypeXls,
  IconVideo,
  IconPhoto,
  IconMusic,
  IconCode,
  IconFileTypeTxt,
  type TablerIcon,
} from '@tabler/icons-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { motion } from 'framer-motion'

interface FileType {
  icon: TablerIcon
  label: string
  color: string
}
const SupportedFileUploadTypes = () => {
  // FIXME: disable audio and video temporarily until figure out Whisper model
  const fileTypes: FileType[] = [
    { icon: IconFileTypePdf, label: 'PDF', color: 'text-red-500' },
    { icon: IconFileTypeDocx, label: 'Word', color: 'text-blue-500' },
    { icon: IconFileTypePpt, label: 'PPT', color: 'text-orange-500' },
    { icon: IconFileTypeXls, label: 'Excel', color: 'text-green-500' },
    // { icon: IconVideo, label: 'Video', color: 'text-purple-500' },
    { icon: IconPhoto, label: 'Image', color: 'text-pink-500' },
    // { icon: IconMusic, label: 'Audio', color: 'text-yellow-500' },
    { icon: IconCode, label: 'Code', color: 'text-cyan-500' },
    {
      icon: IconFileTypeTxt,
      label: 'Text',
      color: 'text-(--foreground-faded)',
    },
  ]

  return (
    <>
      <TooltipProvider>
        <div className="mt-8 mb-6 flex flex-wrap justify-center gap-4">
          {fileTypes.map((type, index) => {
            if (!type.icon) {
              console.error(`Missing icon for type: ${type.label}`)
              return null // Skip rendering this item if icon is missing
            }
            const IconComponent = type.icon

            return (
              <Tooltip key={index}>
                <TooltipTrigger
                  tabIndex={-1}
                  render={
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      className="flex flex-col items-center"
                    >
                      <IconComponent
                        className={`h-6 w-6 ${type.color}`}
                        size={24}
                        stroke={1.5}
                        aria-hidden="true"
                      />
                      <span className="mt-1 text-xs text-gray-500">
                        {type.label}
                      </span>
                    </motion.div>
                  }
                />
                <TooltipContent>
                  <p>{type.label} files supported</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    </>
  )
}

export default SupportedFileUploadTypes
