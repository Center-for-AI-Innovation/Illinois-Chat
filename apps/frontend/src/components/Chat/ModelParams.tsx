import { useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
// import { ModelSelect } from './ModelSelect'
import { TemperatureSlider } from './Temperature'

interface ModelParamsProps {
  selectedConversation: any // Replace 'any' with the appropriate type
  prompts: any // Replace 'any' with the appropriate type
  handleUpdateConversation: (
    conversation: any,
    update: { key: string; value: any },
  ) => void // Replace 'any' with the appropriate types
  t: (key: string) => string
}

export const ModelParams = ({
  selectedConversation,
  prompts,
  handleUpdateConversation,
  t,
}: ModelParamsProps) => {
  const [isChecked, setIsChecked] = useState(false)

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsChecked(event.target.checked)
  }

  const debouncedUpdateTemperature = useDebouncedCallback(
    (temperature: number) => {
      if (!selectedConversation) return
      handleUpdateConversation(selectedConversation, {
        key: 'temperature',
        value: temperature,
      })
    },
    400,
  )

  return (
    <div className="w-full rounded-lg backdrop-filter-[blur(10px)]">
      <div className="flex h-full flex-col space-y-4 rounded-lg p-4">
        <TemperatureSlider
          label={t('Temperature')}
          onChangeTemperature={debouncedUpdateTemperature}
        />
      </div>
    </div>
  )
}
