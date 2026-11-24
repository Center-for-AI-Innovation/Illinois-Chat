import { useId } from 'react'

import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'

interface ProviderFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  secret?: boolean
  error?: string
  disabled?: boolean
}

// Figma "Provider Card / Field": label above input, 6px apart.
export function ProviderField({
  label,
  value,
  onChange,
  placeholder,
  secret,
  error,
  disabled,
}: ProviderFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="leading-5">
        {label}
      </Label>
      <Input
        id={id}
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'off' : undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
