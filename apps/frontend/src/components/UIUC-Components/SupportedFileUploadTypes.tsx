import React from 'react'
import {
  IconFileTypePdf,
  IconFileTypeDocx,
  IconFileTypePpt,
  IconFileTypeXls,
  IconPhoto,
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
  // Stroke colors are the Figma file-type icon colors.
  color: string
}
const SupportedFileUploadTypes = () => {
  // FIXME: disable audio and video temporarily until figure out Whisper model
  // (Figma also shows video and music icons; they stay off until then.)
  const fileTypes: FileType[] = [
    { icon: IconFileTypePdf, label: 'PDF', color: '#dd524c' },
    { icon: IconFileTypeDocx, label: 'Word', color: '#4d81ee' },
    { icon: IconFileTypePpt, label: 'PPT', color: '#e97b35' },
    { icon: IconFileTypeXls, label: 'Excel', color: '#5ec269' },
    { icon: IconPhoto, label: 'Image', color: '#da5597' },
    { icon: IconCode, label: 'Code', color: '#52b3d0' },
    { icon: IconFileTypeTxt, label: 'Text', color: '#9a9d9c' },
  ]

  return (
    <TooltipProvider>
      <ul
        aria-label="Supported file types"
        className="grid shrink-0 list-none grid-cols-[repeat(3,fit-content(100%))] gap-x-6 gap-y-4"
      >
        {fileTypes.map((type) => {
          const IconComponent = type.icon
          return (
            <li key={type.label}>
              <Tooltip>
                <TooltipTrigger
                  tabIndex={-1}
                  render={
                    <motion.div whileHover={{ scale: 1.1 }}>
                      <IconComponent
                        size={32}
                        color={type.color}
                        stroke={1.5}
                        aria-label={`${type.label} files supported`}
                        role="img"
                      />
                    </motion.div>
                  }
                />
                <TooltipContent>
                  <p>{type.label} files supported</p>
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </TooltipProvider>
  )
}

export default SupportedFileUploadTypes
