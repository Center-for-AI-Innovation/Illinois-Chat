import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shadcn/ui/button'
import { Input } from '@/components/shadcn/ui/input'
import { IconArrowRight } from '@tabler/icons-react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/shadcn/ui/dialog'
import NextLink from 'next/link'
import Image from 'next/image'
import axios from 'axios'
import { type FileUpload } from './UploadNotification'
import { type QueryClient } from '@tanstack/react-query'
export default function MITIngestForm({
  project_name,
  setUploadFiles,
  queryClient,
}: {
  project_name: string
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  queryClient: QueryClient
}): JSX.Element {
  const [isUrlValid, setIsUrlValid] = useState(false)
  const delayedInvalidateRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)
  const [url, setUrl] = useState('')
  const [maxUrls, setMaxUrls] = useState('50')
  const [open, setOpen] = useState(false)
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setUrl(input)
    setIsUrlValid(validateUrl(input))
  }
  const validateUrl = (input: string) => {
    const regex = /^https?:\/\/ocw\.mit\.edu\/.+/
    return regex.test(input)
  }
  const downloadMITCourse = async (
    url: string | null,
    courseName: string | null,
    localDir: string | null,
  ) => {
    try {
      if (!url || !courseName || !localDir) return null
      console.log('calling downloadMITCourse')
      const response = await axios.get(`/api/UIUC-api/downloadMITCourse`, {
        params: {
          url: url,
          course_name: courseName,
          local_dir: localDir,
        },
      })
      return response.data
    } catch (error) {
      console.error('Error during MIT course download:', error)
      return null
    }
  }

  const handleIngest = async () => {
    setOpen(false)
    if (isUrlValid) {
      const newFile: FileUpload = {
        name: url,
        status: 'uploading',
        type: 'mit',
      }
      setUploadFiles((prevFiles) => [...prevFiles, newFile])
      setUploadFiles((prevFiles) =>
        prevFiles.map((file) =>
          file.name === url ? { ...file, status: 'ingesting' } : file,
        ),
      )
      try {
        const data = await downloadMITCourse(url, project_name, 'local_dir')
        if (data) {
          setUploadFiles((prevFiles) =>
            prevFiles.map((file) =>
              file.name === url ? { ...file, status: 'complete' } : file,
            ),
          )
          // Refresh the documents table now, and once more shortly after:
          // the download API can resolve before all rows land in the DB.
          void queryClient.invalidateQueries({
            queryKey: ['documents', project_name],
          })
          if (delayedInvalidateRef.current) {
            clearTimeout(delayedInvalidateRef.current)
          }
          delayedInvalidateRef.current = setTimeout(() => {
            void queryClient.invalidateQueries({
              queryKey: ['documents', project_name],
            })
          }, 10_000)
        } else {
          // downloadMITCourse returned null, treat as error
          setUploadFiles((prevFiles) =>
            prevFiles.map((file) =>
              file.name === url ? { ...file, status: 'error' } : file,
            ),
          )
          void queryClient.invalidateQueries({
            queryKey: ['failedDocuments', project_name],
          })
        }
      } catch (error) {
        console.error('Error during MIT course import:', error)
        setUploadFiles((prevFiles) =>
          prevFiles.map((file) =>
            file.name === url ? { ...file, status: 'error' } : file,
          ),
        )
        void queryClient.invalidateQueries({
          queryKey: ['failedDocuments', project_name],
        })
      }
    } else {
      alert('Invalid URL (please include https://)')
    }
  }
  const [inputErrors, setInputErrors] = useState({
    maxUrls: { error: false, message: '' },
    maxDepth: { error: false, message: '' },
  })

  useEffect(() => {
    return () => {
      if (delayedInvalidateRef.current) {
        clearTimeout(delayedInvalidateRef.current)
      }
    }
  }, [])

  return (
    <motion.div layout>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setUrl('')
            setIsUrlValid(false)
            setMaxUrls('50')
          }
        }}
      >
        <DialogTrigger
          tabIndex={0}
          nativeButton={false}
          className="focus:bg-(--dashboard-background-dark)"
          render={
            <div
              className="group relative h-full cursor-pointer overflow-hidden rounded-2xl border border-(--dashboard-border) bg-transparent px-6 py-4 text-(--dashboard-foreground) transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
            >
              <div className="mb-2 -ml-2 flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full">
                    <Image
                      src="/media/mitocw_logo.jpg"
                      alt="MIT OCW Logo"
                      width={32}
                      height={32}
                      className="rounded-full object-contain"
                    />
                  </div>
                  <p className="text-xl font-semibold">MIT Course</p>
                </div>
              </div>

              <p className="mb-4 text-sm leading-relaxed text-(--dashboard-foreground-faded)">
                Import content from MIT OpenCourseWare, including lecture notes,
                assignments, and course materials.
              </p>
              <div className="mt-auto flex items-center text-sm font-bold text-(--dashboard-button)">
                <span>Configure import</span>
                <IconArrowRight
                  size={16}
                  aria-hidden="true"
                  className="ml-2 transition-transform group-hover:translate-x-1"
                />
              </div>
            </div>
          }
        />

        <DialogContent className="mx-auto h-auto max-h-[85vh] w-[95%] max-w-2xl overflow-y-auto rounded-2xl! border-0 bg-(--modal) px-4 py-6 text-(--modal-text) sm:px-6">
          <DialogHeader>
            <DialogTitle className="mb-4 text-left text-xl font-bold">
              Ingest MIT Course
            </DialogTitle>
          </DialogHeader>
          <div className="">
            <div className="">
              <div>
                <div className="text-sm wrap-break-word sm:text-base">
                  <p className="mb-2 text-sm font-semibold text-(--illinois-orange)">
                    Coming soon: MIT ingest is temporarily unavailable.
                  </p>
                  <strong>For MIT Open Course Ware</strong>, just enter a URL
                  like{' '}
                  <code className="inline-flex items-center rounded-md bg-(--illinois-orange) px-2 py-1 font-mono text-xs text-(--illinois-white) sm:text-sm">
                    ocw.mit.edu/courses/ANY_COURSE
                  </code>
                  ,<br />
                  for example:{' '}
                  <span className="break-all">
                    <NextLink
                      target="_blank"
                      rel="noreferrer"
                      href={
                        'https://ocw.mit.edu/courses/8-321-quantum-theory-i-fall-2017'
                      }
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className="text-(--dashboard-button)"
                    >
                      https://ocw.mit.edu/courses/8-321-quantum-theory-i-fall-2017
                    </NextLink>
                  </span>
                  .
                </div>

                <div className="relative mt-4 w-full">
                  <Image
                    src="/media/mitocw_logo.jpg"
                    alt="MIT OCW Logo"
                    width={24}
                    height={24}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 object-contain"
                  />
                  <Input
                    aria-label="MIT OCW course URL"
                    className="h-12 w-full truncate rounded-full border-(--background-dark) bg-(--background-faded) pl-11 text-(--foreground) focus-visible:border-(--illinois-orange)"
                    placeholder="Enter URL..."
                    type="url"
                    value={url}
                    onChange={(e) => {
                      handleUrlChange(e)
                    }}
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleIngest}
              disabled
              className="h-11 w-full rounded-xl bg-(--dashboard-button) text-(--dashboard-button-foreground) transition-colors hover:bg-(--dashboard-button-hover) disabled:bg-(--background-faded) disabled:text-(--background-dark)"
            >
              Ingest MIT Course
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
