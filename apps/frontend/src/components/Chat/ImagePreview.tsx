// ImagePreview.tsx
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/shadcn/ui/dialog'
import { montserrat_heading } from 'fonts'
import { XIcon } from 'lucide-react'

interface ImagePreviewProps {
  src: string
  alt?: string
  className?: string
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  alt,
  className,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setIsModalOpen(true)}
        style={{ cursor: 'pointer' }}
        onLoad={() => setIsImageLoaded(true)}
        className={
          isImageLoaded
            ? className
            : `${className} image-loading-shimmer`
        }
      />
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="modal-common w-full max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-[788px]"
        >
          <div className="modal-header-common flex items-center justify-between">
            <DialogTitle
              className={`modal-title-common ${montserrat_heading.variable} font-montserratHeading`}
            >
              {alt || 'Image Preview'}
            </DialogTitle>
            <DialogClose
              aria-label="Close image preview"
              className="modal-close-button-common rounded p-1"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </DialogClose>
          </div>
          <div className="modal-body-common">
            <div className="file-preview-container">
              <img
                src={src}
                alt={alt}
                className="file-preview-image"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
