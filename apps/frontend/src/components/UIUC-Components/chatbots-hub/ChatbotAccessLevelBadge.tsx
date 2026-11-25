import { cva } from 'class-variance-authority'
import { EyeOff, Globe, LockKeyhole } from 'lucide-react'
import { cn } from '~/components/shadcn/lib/utils'
import { Badge } from '~/components/shadcn/ui/badge'
import { type ChatbotAccessLevel } from './chatbots.types'

type ChatbotAccessLevelBadgeProps = {
  level: ChatbotAccessLevel
  className?: string
}

const accessLevelBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[8px]',
  {
    variants: {
      level: {
        private:
          'border-transparent bg-[#fef2f2] text-[#b91c1c] hover:bg-[#fef2f2] dark:bg-[#ef444433] dark:text-[#f87171] dark:hover:bg-[#ef444433]',
        unlisted:
          'border-transparent bg-[#fefce8] text-[#a16207] hover:bg-[#fefce8] dark:bg-[#eab30833] dark:text-[#facc15] dark:hover:bg-[#eab30833]',
        public:
          'border-transparent bg-[#f0fdf4] text-[#15803d] hover:bg-[#f0fdf4] dark:bg-[#22c55e33] dark:text-[#4ade80] dark:hover:bg-[#22c55e33]',
      },
    },
  },
)

const accessLevelLabels: Record<ChatbotAccessLevel, string> = {
  private: 'Private',
  unlisted: 'Unlisted',
  public: 'Public',
}

export function ChatbotAccessLevelBadge({
  level,
  className,
}: ChatbotAccessLevelBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(accessLevelBadgeVariants({ level }), className)}
    >
      {level === 'private' && <LockKeyhole className="h-4 w-4" />}
      {level === 'unlisted' && <EyeOff className="h-4 w-4" />}
      {level === 'public' && <Globe className="h-4 w-4" />}
      {accessLevelLabels[level]}
    </Badge>
  )
}
