import { cn } from '@/components/shadcn/lib/utils'
import type { GeneratedFile } from 'ai'

export type ImageProps = Pick<GeneratedFile, 'base64' | 'mediaType'> & {
  className?: string
  alt?: string
}

export const Image = ({ base64, mediaType, ...props }: ImageProps) => (
  <img
    {...props}
    alt={props.alt}
    className={cn(
      'h-auto max-w-full overflow-hidden rounded-md',
      props.className,
    )}
    src={`data:${mediaType};base64,${base64}`}
  />
)
