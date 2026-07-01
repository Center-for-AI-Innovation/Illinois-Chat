// Dev-only reference: Mantine 6 components (in use) side-by-side with shadcn/Radix
// equivalents, for the Mantine retirement (Illinois-Chat#45). Route: /dev/mantine-shadcn
// Each library is isolated in its own module (mantineExamples / shadcnExamples) because
// Mantine and shadcn export many of the same names. Styling fidelity is NOT the goal.
import { Toaster } from '@/components/shadcn/ui/sonner'
import { mantineExamples } from '@/components/dev/mantineExamples'
import { shadcnExamples } from '@/components/dev/shadcnExamples'

const COMPONENTS = [
  {
    name: 'Button',
    category: 'Interactive',
    note: 'variant (filled/outline/light/subtle), color, size, radius, leftIcon/rightIcon, loading, disabled, fullWidth',
    status: 'exists',
  },
  {
    name: 'ActionIcon',
    category: 'Interactive',
    note: 'Use Button with size="icon" + variant; color, radius, loading, disabled; no native icon-sizing like ActionIcon',
    status: 'exists',
  },
  {
    name: 'Text',
    category: 'Typography',
    note: 'size, color (color props), weight, transform, align, lineClamp, truncate, inline, underline, strikethrough, italic',
    status: 'needs-build',
  },
  {
    name: 'Title',
    category: 'Typography',
    note: 'order (h1-h6), size, color, weight (inherit from Text), transform, align, underline, italic, lineClamp, truncate',
    status: 'needs-build',
  },
  {
    name: 'Divider',
    category: 'Layout',
    note: 'orientation (horizontal/vertical), size, color, variant (solid/dashed/dotted), label + labelPosition (not in shadcn)',
    status: 'exists',
  },
  {
    name: 'Badge',
    category: 'Status',
    note: 'variant (filled/light/outline/dot), color, size, radius, fullWidth, leftSection/rightSection (icon slots)',
    status: 'exists',
  },
  {
    name: 'TextInput',
    category: 'Form Inputs',
    note: 'variant (filled/outline/unstyled), size (xs/sm/md/lg/xl), radius, placeholder, disabled, error state',
    status: 'exists',
  },
  {
    name: 'Textarea',
    category: 'Form Inputs',
    note: 'variant (filled/outline/unstyled), minRows/maxRows, size, radius, disabled, error state',
    status: 'exists',
  },
  {
    name: 'Select',
    category: 'Form Inputs',
    note: 'variant (filled/outline/unstyled), size, data array, disabled items, group support, clearable',
    status: 'exists',
  },
  {
    name: 'Checkbox',
    category: 'Form Controls',
    note: 'size (sm/md/lg via CSS), disabled state, indeterminate state, variant (outline/filled)',
    status: 'exists',
  },
  {
    name: 'Switch',
    category: 'Form Controls',
    note: 'size (sm/default/lg), variant (default/labeled), disabled, showLabels, showThumbIcon, onLabel/offLabel',
    status: 'exists',
  },
  {
    name: 'Slider',
    category: 'Form Controls',
    note: 'min/max/step, range mode (single vs multiple thumbs), marks/labels, disabled, onChange callback',
    status: 'exists',
  },
  {
    name: 'MultiSelect',
    category: 'Inputs & Selection',
    note: 'searchable (filter/search), clearable, placeholder, data array (string|object), defaultValue, color, size, maxDropdownHeight',
    status: 'needs-build',
  },
  {
    name: 'SegmentedControl',
    category: 'Inputs & Selection',
    note: 'type (single for radio-like), value, onChange/onValueChange, data/children, size, color, radius, variant',
    status: 'exists',
  },
  {
    name: 'Modal',
    category: 'Overlays & Popovers',
    note: 'opened/open state, title, onClose/onOpenChange, centered/position, withCloseButton, withOverlay, padding, size, blur',
    status: 'exists',
  },
  {
    name: 'Tooltip',
    category: 'Overlays & Popovers',
    note: 'label/content text, position (top/bottom/left/right), offset/sideOffset, withArrow, color, radius, size, openDelay, closeDelay',
    status: 'exists',
  },
  {
    name: 'Menu',
    category: 'Overlays & Popovers',
    note: 'trigger/target, children layout, item styling, dividers/separators, closeOnItemClick, position, offset, loop navigation',
    status: 'exists',
  },
  {
    name: 'HoverCard',
    category: 'Overlays & Popovers',
    note: 'trigger/target, children content, position (side), openDelay, closeDelay, sideOffset, align (center/start/end)',
    status: 'exists',
  },
  {
    name: 'Card',
    category: 'Container',
    note: 'padding, radius, shadow, variant (light/filled/outline), border support',
    status: 'exists',
  },
  {
    name: 'Paper',
    category: 'Container',
    note: 'shadow, padding, radius, withBorder; use Card component as Paper equivalent',
    status: 'exists',
  },
  {
    name: 'Table',
    category: 'Data Display',
    note: 'striped, highlightOnHover, withBorder, fontSize, spacing (horizontal/vertical); shadcn uses Tailwind hover/border via className',
    status: 'exists',
  },
  {
    name: 'Avatar',
    category: 'Data Display',
    note: 'size, radius, color, variant (filled/light/gradient/outline); shadcn has AvatarImage/AvatarFallback subcomponents, no built-in Group',
    status: 'exists',
  },
  {
    name: 'Indicator',
    category: 'Data Display',
    note: 'color, position (top-end/bottom-end/etc), size, label, withBorder, processing, offset; no shadcn equivalent\u2014use Badge with absolute positioning',
    status: 'needs-build',
  },
  {
    name: 'Progress',
    category: 'Feedback',
    note: 'value (0-100), color, size, radius, striped, animate, sections; shadcn has minimal theming\u2014use className for color/size customization',
    status: 'exists',
  },
  {
    name: 'List',
    category: 'Data Display',
    note: 'type (unordered/ordered), spacing, size, icon, withPadding, center; shadcn has no List component\u2014use native ul/ol/li with Tailwind (list-disc/list-decimal, space-y-*, list-inside)',
    status: 'exists',
  },
  {
    name: 'Tabs',
    category: 'Disclosure',
    note: 'variant (implicit via data-[state=active] state), defaultValue \u2192 defaultValue, Tab \u2192 TabsTrigger subcomponent',
    status: 'exists',
  },
  {
    name: 'Accordion',
    category: 'Disclosure',
    note: 'type (single/multiple), defaultValue, chevron rotate animation via [&[data-state=open]>svg]:rotate-180',
    status: 'exists',
  },
  {
    name: 'Collapse',
    category: 'Disclosure',
    note: 'in (boolean open state), transitionDuration, animateOpacity; note: shadcn/collapsible is simpler\u2014use Accordion for nested multi-item lists',
    status: 'exists',
  },
  {
    name: 'Alert',
    category: 'Feedback',
    note: 'variant (light/outline/filled \u2192 default/destructive), color (mantine), withCloseButton, title/children; shadcn limited to 2 variants',
    status: 'exists',
  },
  {
    name: 'ScrollArea',
    category: 'Layout',
    note: 'type (auto/always/scroll/hover/never), scrollbarSize, scrollHideDelay, orientation; shadcn uses Tailwind for sizing',
    status: 'exists',
  },
  {
    name: 'Notifications',
    category: 'Feedback',
    note: 'position (top-left/right/center, bottom-*), autoClose, transitionDuration; migration \u2192 sonner toast() with toast.success/error/info/warning methods',
    status: 'exists',
  },
  {
    name: 'CopyButton',
    category: 'Interaction',
    note: 'value, timeout (500ms default), copied render-prop pattern; shadcn has no built-in\u2014compose Button + useCallback + useState',
    status: 'needs-build',
  },
]

export default function MantineShadcnComparison() {
  return (
    <div className="mx-auto max-w-6xl bg-white p-8 text-black">
      <Toaster />
      <h1 className="mb-2 text-2xl font-bold">
        Mantine 6 to shadcn/Radix component map
      </h1>
      <p className="mb-8 text-sm text-gray-600">
        Every Mantine component in use, side-by-side with its shadcn/Radix
        replacement. Styling is intentionally left as defaults. Tracks
        Illinois-Chat#45.
      </p>
      {COMPONENTS.map((c) => (
        <section
          key={c.name}
          className="mb-8 rounded-lg border border-gray-300 p-5"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{c.name}</h2>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {c.category}
            </span>
          </div>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex-1 rounded-md border border-gray-200 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Mantine 6
              </div>
              <div className="flex flex-col items-start gap-3">
                {mantineExamples[c.name]?.()}
              </div>
            </div>
            <div className="flex-1 rounded-md border border-gray-200 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                shadcn/Radix{c.status === 'needs-build' ? ' (needs build)' : ''}
              </div>
              <div className="flex flex-col items-start gap-3">
                {shadcnExamples[c.name]?.()}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            <span className="font-semibold">
              Mantine styles/props to reproduce:
            </span>{' '}
            {c.note}
          </p>
        </section>
      ))}
    </div>
  )
}
