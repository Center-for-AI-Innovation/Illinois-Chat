'use client'

import * as React from 'react'
import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/shadcn/ui/combobox'

export interface DocGroupOption {
  value: string
  label: string
}

interface DocGroupComboboxItem extends DocGroupOption {
  /** Present only on the synthesized "Create …" sentinel item. */
  creatable?: string
}

interface DocGroupMultiSelectProps {
  data: DocGroupOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  nothingFoundText?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * A searchable, multi-select, create-on-type combobox for assigning document
 * groups. Base UI's combobox has no built-in `creatable` concept, so
 * create-on-type is hand-built here: a synthesized sentinel item
 * is appended to the filtered list whenever the query has no exact match,
 * and selecting it creates (and immediately selects) a plain string entry
 * instead of leaking the sentinel object out through `onChange`.
 */
export function DocGroupMultiSelect({
  data,
  value,
  onChange,
  placeholder = 'Select Group',
  nothingFoundText = 'No groups... Start typing to create a new one ✨',
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: DocGroupMultiSelectProps) {
  const [query, setQuery] = React.useState('')

  const selectedItems: DocGroupComboboxItem[] = value.map(
    (name) =>
      data.find((option) => option.value === name) ?? {
        value: name,
        label: name,
      },
  )

  const trimmed = query.trim()
  const lowered = trimmed.toLocaleLowerCase()
  const exactMatchExists = data.some(
    (option) => option.label.trim().toLocaleLowerCase() === lowered,
  )

  const itemsForView: DocGroupComboboxItem[] =
    trimmed !== '' && !exactMatchExists
      ? [
          ...data,
          {
            creatable: trimmed,
            value: `create:${lowered}`,
            label: `+ Create "${trimmed}"`,
          },
        ]
      : data

  return (
    <Combobox
      items={itemsForView}
      multiple
      autoHighlight
      isItemEqualToValue={(item, val) =>
        (item as DocGroupComboboxItem).value ===
        (val as DocGroupComboboxItem).value
      }
      value={selectedItems}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        const nextItems = next as DocGroupComboboxItem[]
        const creatableSelection = nextItems.find((item) => item.creatable)

        const clean = nextItems.filter((item) => !item.creatable)
        if (creatableSelection) {
          const createdName = creatableSelection.creatable as string
          if (!clean.some((item) => item.value === createdName)) {
            clean.push({ value: createdName, label: createdName })
          }
        }

        setQuery('')
        onChange(clean.map((item) => item.value))
      }}
      disabled={disabled}
    >
      <ComboboxInputGroup
        className={['doc-group-multiselect', className]
          .filter(Boolean)
          .join(' ')}
      >
        <ComboboxChips>
          <ComboboxValue>
            {(items: DocGroupComboboxItem[]) => (
              <>
                {items.map((item) => (
                  <ComboboxChip key={item.value} aria-label={item.label}>
                    {item.label}
                    <ComboboxChipRemove aria-label={`Remove ${item.label}`} />
                  </ComboboxChip>
                ))}
                <ComboboxInput
                  aria-label={ariaLabel}
                  placeholder={items.length > 0 ? '' : placeholder}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>{nothingFoundText}</ComboboxEmpty>
        <ComboboxList>
          {(item: DocGroupComboboxItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
