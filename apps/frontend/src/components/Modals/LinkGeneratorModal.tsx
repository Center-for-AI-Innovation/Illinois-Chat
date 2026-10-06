import React, { useEffect, useState } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/shadcn/ui/dialog'
import { Button } from '@/components/shadcn/ui/button'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { XIcon } from 'lucide-react'
import { Switch } from '@/components/shadcn/ui/switch'

interface LinkGeneratorModalProps {
  opened: boolean
  onClose: () => void
  course_name: string
  currentSettings: {
    guidedLearning: boolean
    documentsOnly: boolean
    systemPromptOnly: boolean
  }
}

export const LinkGeneratorModal = ({
  opened,
  onClose,
  course_name,
  currentSettings,
}: LinkGeneratorModalProps) => {
  const [linkSettings, setLinkSettings] = useState({
    guidedLearning: false,
    documentsOnly: false,
    systemPromptOnly: false,
  })
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // Reset link settings when modal is opened
  useEffect(() => {
    if (opened) {
      setLinkSettings({
        guidedLearning: false,
        documentsOnly: false,
        systemPromptOnly: false,
      })
    }
  }, [opened])

  const handleSettingChange =
    (setting: keyof typeof linkSettings) => (value: boolean) => {
      setLinkSettings((prev) => ({
        ...prev,
        [setting]: value,
      }))
    }

  useEffect(() => {
    const baseUrl = window.location.origin
    const queryParams = new URLSearchParams()

    Object.entries(linkSettings).forEach(([key, value]) => {
      if (value) {
        const paramName = key as keyof typeof linkSettings
        queryParams.append(paramName, 'true')
      }
    })

    const queryString = queryParams.toString()
    const chatUrl = `${baseUrl}/${course_name}/chat${
      queryString ? `?${queryString}` : ''
    }`
    setGeneratedLink(chatUrl)
  }, [linkSettings, course_name])

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={opened} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-md border border-(--modal-border) bg-(--modal) p-0 text-(--modal-text) sm:max-w-lg"
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#2D2F48] px-6 py-5">
          <DialogTitle className="text-lg font-bold text-(--modal-text)">
            Generate Shareable Link
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            className="mt-1 text-(--foreground-faded)"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <p className="text-sm" style={{ lineHeight: 1.5 }}>
            Configure AI behavior settings for your shareable link. These
            settings will enable specific behaviors when users access the
            chat through this link. Note: If a setting is enabled
            course-wide, enabling it here will ensure it stays active even if
            course-wide settings change in the future.
          </p>

          <div className="flex flex-col gap-2">
            <Switch
              variant="labeled"
              size="lg"
              showLabels
              showThumbIcon
              label="Guided Learning"
              tooltip={
                currentSettings.guidedLearning
                  ? 'This setting is currently enabled course-wide. Enabling it here will ensure it stays active even if course settings change.'
                  : 'Enable guided learning mode for this link. The AI will encourage independent problem-solving by providing hints and questions instead of direct answers.'
              }
              checked={linkSettings.guidedLearning}
              onCheckedChange={handleSettingChange('guidedLearning')}
            />

            <Switch
              variant="labeled"
              size="lg"
              showLabels
              showThumbIcon
              label="Document-Based References Only"
              tooltip={
                currentSettings.documentsOnly
                  ? 'This setting is currently enabled course-wide. Enabling it here will ensure it stays active even if course settings change.'
                  : "Restrict AI to only use information from provided documents. The AI will not use external knowledge or make assumptions beyond the documents' content."
              }
              checked={linkSettings.documentsOnly}
              onCheckedChange={handleSettingChange('documentsOnly')}
            />

            <Switch
              variant="labeled"
              size="lg"
              showLabels
              showThumbIcon
              label="Bypass Illinois Chat's internal prompting"
              tooltip={
                currentSettings.systemPromptOnly
                  ? 'This setting is currently enabled course-wide. Enabling it here will ensure it stays active even if course settings change.'
                  : "Use raw system prompt without additional internal prompting. This bypasses Illinois Chat's built-in prompts for citations and helpfulness."
              }
              checked={linkSettings.systemPromptOnly}
              onCheckedChange={handleSettingChange('systemPromptOnly')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Generated Link</p>

            <div
              className="rounded-md border border-(--background-dark) bg-(--background-faded) p-4"
              style={{ wordBreak: 'break-all' }}
            >
              <p className="text-sm text-(--modal-text)" style={{ lineHeight: 1.5 }}>
                {generatedLink}
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleCopy}
                className="min-w-[140px] justify-start gap-2 rounded-md bg-(--dashboard-button) px-5 py-2.5 font-semibold text-white transition-all duration-200 hover:bg-(--dashboard-button-hover)"
              >
                {copied ? (
                  <IconCheck size={16} aria-hidden="true" />
                ) : (
                  <IconCopy size={16} aria-hidden="true" />
                )}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
