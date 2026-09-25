import React, { useState } from 'react'
import { Button } from '@/components/shadcn/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { IconCopy, IconInfoCircle } from '@tabler/icons-react'
import { montserrat_paragraph } from 'fonts'

interface CustomCopyButtonProps {
  label: string
  tooltip: string
  onClick: () => void
}

const CustomCopyButton: React.FC<CustomCopyButtonProps> = ({
  label,
  tooltip,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="flex cursor-pointer items-center rounded-lg p-2 transition-all duration-200 ease-in-out"
      style={{
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        transform: isHovered ? 'translateY(-1px)' : 'none',
        boxShadow: isHovered ? '0 4px 6px rgba(255, 255, 255, 0.1)' : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <Button
        className={`relative flex h-auto min-h-9 items-center justify-center gap-1 bg-(--dashboard-button) px-3 py-2 text-center text-(--dashboard-button-foreground) hover:bg-(--dashboard-button-hover) active:bg-(--dashboard-button) ${montserrat_paragraph.variable} font-montserratParagraph`}
      >
        <IconCopy size={18} aria-hidden="true" />
      </Button>
      <span
        className={`${montserrat_paragraph.variable} text-md font-montserratParagraph ml-3 flex items-center text-(--dashboard-foreground) transition-colors duration-200 ease-in-out`}
      >
        {label}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="ml-2 cursor-pointer transition-transform duration-200 ease-in-out"
                style={{
                  transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <IconInfoCircle
              size={16}
              aria-hidden="true"
              className={
                isHovered ? 'text-(--dashboard-foreground)' : 'text-gray-400'
              }
              style={{ transition: 'all 0.2s ease-in-out' }}
            />
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-[220px] text-wrap bg-(--tooltip-background) text-sm text-(--tooltip)"
            arrowClassName="bg-(--tooltip-background) fill-(--tooltip-background)"
          >
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </span>
    </div>
  )
}

export default CustomCopyButton
