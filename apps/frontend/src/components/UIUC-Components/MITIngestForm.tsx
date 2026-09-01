import React, { useState } from 'react'
import { Text, Card, Button, Input, Image } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../Dialog'
import NextLink from 'next/link'

export default function MITIngestForm(): JSX.Element {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)

  return (
    <motion.div layout>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setUrl('')
          }
        }}
      >
        <DialogTrigger
          asChild
          tabIndex={0}
          className="focus:bg-[--dashboard-background-dark]"
        >
          <Card
            role="button"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).click()
              }
            }}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[--dashboard-border] bg-transparent px-6 py-4 text-[--dashboard-foreground] transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
            style={{ height: '100%' }}
          >
            <div className="-ml-2 mb-2 flex items-center justify-between">
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
                <Text className="text-xl font-semibold">MIT Course</Text>
              </div>
            </div>

            <Text className="mb-4 text-sm leading-relaxed text-[--dashboard-foreground-faded]">
              Import content from MIT OpenCourseWare, including lecture notes,
              assignments, and course materials.
            </Text>
            <div className="mt-auto flex items-center text-sm font-bold text-[--dashboard-button]">
              <span>Configure import</span>
              <IconArrowRight
                size={16}
                aria-hidden="true"
                className="ml-2 transition-transform group-hover:translate-x-1"
              />
            </div>
          </Card>
        </DialogTrigger>

        <DialogContent className="mx-auto h-auto max-h-[85vh] w-[95%] max-w-2xl overflow-y-auto !rounded-2xl border-0 bg-[--modal] px-4 py-6 text-[--modal-text] sm:px-6">
          <DialogHeader>
            <DialogTitle className="mb-4 text-left text-xl font-bold">
              Ingest MIT Course
            </DialogTitle>
          </DialogHeader>
          <div className="">
            <div className="">
              <div>
                <div className="break-words text-sm sm:text-base">
                  <Text className="mb-2 text-sm font-semibold text-[--illinois-orange]">
                    Coming soon: MIT ingest is temporarily unavailable.
                  </Text>
                  <strong>For MIT Open Course Ware</strong>, just enter a URL
                  like{' '}
                  <code className="inline-flex items-center rounded-md bg-[--illinois-orange] px-2 py-1 font-mono text-xs text-[--illinois-white] sm:text-sm">
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
                      className="text-[--dashboard-button]"
                    >
                      https://ocw.mit.edu/courses/8-321-quantum-theory-i-fall-2017
                    </NextLink>
                  </span>
                  .
                </div>

                <Input
                  icon={
                    <Image
                      src="/media/mitocw_logo.jpg"
                      alt="MIT OCW Logo"
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  }
                  aria-label="MIT OCW course URL"
                  className="mt-4 w-full rounded-full"
                  styles={{
                    input: {
                      color: 'var(--foreground)',
                      backgroundColor: 'var(--background-faded)',
                      borderColor: 'var(--background-dark)',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      '&:focus': {
                        borderColor: 'var(--illinois-orange)',
                      },
                    },
                    wrapper: {
                      width: '100%',
                    },
                  }}
                  placeholder="Enter URL..."
                  radius="md"
                  type="url"
                  value={url}
                  size="lg"
                  onChange={(e) => setUrl(e.target.value)}
                  disabled
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              disabled
              className="h-11 w-full rounded-xl bg-[--dashboard-button] text-[--dashboard-button-foreground] transition-colors hover:bg-[--dashboard-button-hover] disabled:bg-[--background-faded] disabled:text-[--background-dark]"
            >
              Ingest MIT Course
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
