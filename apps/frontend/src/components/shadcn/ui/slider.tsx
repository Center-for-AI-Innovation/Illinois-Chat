import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/components/shadcn/lib/utils'

interface SliderMark {
  value: number
  label?: React.ReactNode
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  marks,
  markLabelClassName,
  ...props
}: SliderPrimitive.Root.Props & {
  /** Fixed tick labels rendered below the track (Mantine `Slider marks`). */
  marks?: SliderMark[]
  markLabelClassName?: string
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn(
        'data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full',
        className,
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative grow overflow-hidden rounded-full select-none data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
          {marks?.map((mark) => (
            <span
              key={mark.value}
              aria-hidden="true"
              data-slot="slider-mark"
              className="bg-background/80 absolute top-1/2 size-1 -translate-y-1/2 rounded-full"
              style={{
                left: `${((mark.value - min) / (max - min)) * 100}%`,
              }}
            />
          ))}
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-xs transition-[color,box-shadow] select-none hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
      {marks && marks.some((mark) => mark.label !== undefined) && (
        <div className="relative mt-1 h-4 w-full">
          {marks.map((mark) =>
            mark.label === undefined ? null : (
              <span
                key={mark.value}
                data-slot="slider-mark-label"
                className={cn(
                  'text-muted-foreground absolute -translate-x-1/2 text-xs whitespace-nowrap first:translate-x-0 last:-translate-x-full',
                  markLabelClassName,
                )}
                style={{
                  left: `${((mark.value - min) / (max - min)) * 100}%`,
                }}
              >
                {mark.label}
              </span>
            ),
          )}
        </div>
      )}
    </SliderPrimitive.Root>
  )
}

export { Slider }
