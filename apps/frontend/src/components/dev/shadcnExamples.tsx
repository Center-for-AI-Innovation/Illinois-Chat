/* eslint-disable @typescript-eslint/no-empty-function */
import React, { type ReactNode } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/shadcn/ui/accordion'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/shadcn/ui/alert'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/shadcn/ui/avatar'
import { Badge } from '@/components/shadcn/ui/badge'
import { Button } from '@/components/shadcn/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/shadcn/ui/card'
import { Checkbox } from '@/components/shadcn/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/shadcn/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/shadcn/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/ui/dropdown-menu'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/shadcn/ui/hover-card'
import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'
import { Progress } from '@/components/shadcn/ui/progress'
import { ScrollArea } from '@/components/shadcn/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/ui/select'
import { Separator } from '@/components/shadcn/ui/separator'
import { Slider } from '@/components/shadcn/ui/slider'
import { Switch } from '@/components/shadcn/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/shadcn/ui/tabs'
import { Textarea } from '@/components/shadcn/ui/textarea'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/shadcn/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/shadcn/ui/tooltip'
import { toast } from 'sonner'

function ShadcnDialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="rounded border px-3 py-1 text-sm">
          Open Dialog
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modal Title</DialogTitle>
          <DialogDescription>Modal content goes here</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export const shadcnExamples: Record<string, () => ReactNode> = {
  Button: () => (
    <>
      <Button variant="default" size="default">
        Default Button
      </Button>
      <Button variant="outline" size="default">
        Outline
      </Button>
      <Button variant="ghost" size="sm">
        Ghost
      </Button>
    </>
  ),
  ActionIcon: () => (
    <>
      <Button variant="default" size="icon">
        O
      </Button>
      <Button variant="ghost" size="icon">
        X
      </Button>
      <Button variant="outline" size="icon" disabled>
        -
      </Button>
    </>
  ),
  Text: () => (
    <span className="text-sm text-muted-foreground">
      Needs custom build: use native &lt;p&gt;/&lt;span&gt; with Tailwind
      classes (text-sm, text-muted-foreground, font-semibold, italic, underline)
    </span>
  ),
  Title: () => (
    <span className="text-sm text-muted-foreground">
      Needs custom build: use native &lt;h1&gt;-&lt;h3&gt; with Tailwind
      (text-3xl, text-2xl, text-xl, font-bold, font-semibold)
    </span>
  ),
  Divider: () => (
    <>
      <Separator orientation="horizontal" className="" />
      <Separator orientation="vertical" className="" />
      <Separator />
    </>
  ),
  Badge: () => (
    <>
      <Badge variant="default">Default Badge</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="secondary">Secondary</Badge>
    </>
  ),
  TextInput: () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="text" placeholder="your@email.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" type="text" placeholder="enter username" />
      </div>
    </>
  ),
  Textarea: () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="comments">Comments</Label>
        <Textarea id="comments" placeholder="Your feedback" rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" placeholder="Enter details" autoFocus />
      </div>
    </>
  ),
  Select: () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="option">Choose option</Label>
        <Select>
          <SelectTrigger id="option">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="react">React</SelectItem>
            <SelectItem value="angular">Angular</SelectItem>
            <SelectItem value="vue">Vue</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select>
          <SelectTrigger id="status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  ),
  Checkbox: () => (
    <>
      <div className="flex items-center space-x-2">
        <Checkbox id="agree" />
        <Label htmlFor="agree">I agree</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="subscribe" />
        <Label htmlFor="subscribe">Subscribe</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled" disabled />
        <Label htmlFor="disabled" className="opacity-50">
          Disabled
        </Label>
      </div>
    </>
  ),
  Switch: () => (
    <>
      <div className="flex items-center space-x-2">
        <Switch id="notify" />
        <label htmlFor="notify" className="cursor-pointer text-sm font-medium">
          Enable notifications
        </label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="darkmode" size="lg" />
        <label
          htmlFor="darkmode"
          className="cursor-pointer text-sm font-medium"
        >
          Dark mode
        </label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="terms" disabled />
        <label
          htmlFor="terms"
          className="cursor-pointer text-sm font-medium opacity-50"
        >
          Accept terms
        </label>
      </div>
    </>
  ),
  Slider: () => (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium">Volume</label>
        <Slider
          defaultValue={[50]}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Range</label>
        <Slider
          defaultValue={[20, 80]}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
      </div>
    </>
  ),
  MultiSelect: () => (
    <span className="text-sm text-muted-foreground">
      Needs custom build: Combine Command + Badge. See /command and /badge
      components as building blocks for a custom multi-select with searchable
      input and removable badge items.
    </span>
  ),
  SegmentedControl: () => (
    <>
      <ToggleGroup
        type="single"
        defaultValue="option1"
        onValueChange={() => {}}
      >
        <ToggleGroupItem value="option1" aria-label="Option 1">
          Option 1
        </ToggleGroupItem>
        <ToggleGroupItem value="option2" aria-label="Option 2">
          Option 2
        </ToggleGroupItem>
        <ToggleGroupItem value="option3" aria-label="Option 3">
          Option 3
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  ),
  Modal: () => <ShadcnDialogDemo />,
  Tooltip: () => (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button>Hover me</button>
          </TooltipTrigger>
          <TooltipContent side="top">Tooltip content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  ),
  Menu: () => (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Menu</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ),
  HoverCard: () => (
    <>
      <HoverCard>
        <HoverCardTrigger asChild>
          <a href="#">Username</a>
        </HoverCardTrigger>
        <HoverCardContent>
          <p>User profile info goes here</p>
        </HoverCardContent>
      </HoverCard>
    </>
  ),
  Card: () => (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>Content</CardContent>
      </Card>
      <Card>Minimal card</Card>
    </>
  ),
  Paper: () => (
    <>
      <Card className="rounded-lg shadow-md">Card with shadow</Card>
      <Card className="rounded-sm border">Card with border</Card>
    </>
  ),
  Table: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Column</TableHead>
          <TableHead>Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Row 1</TableCell>
          <TableCell>Value</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  Avatar: () => (
    <>
      <Avatar>
        <AvatarImage src="/avatar.jpg" alt="User" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <div className="flex -space-x-2">
        <Avatar>
          <AvatarImage src="/a1.jpg" />
        </Avatar>
        <Avatar>
          <AvatarImage src="/a2.jpg" />
        </Avatar>
      </div>
    </>
  ),
  Indicator: () => (
    <span className="text-sm text-muted-foreground">
      Needs custom build: Use Badge component positioned absolutely via CSS for
      indicator patterns, or build custom positioned-badge wrapper with Tailwind
      positioning utilities
    </span>
  ),
  Progress: () => (
    <>
      <Progress value={65} className="h-2" />
      <Progress value={50} className="h-3" />
      <Progress value={30} className="h-2" />
    </>
  ),
  List: () => (
    <>
      <ul className="list-inside list-disc space-y-2">
        <li>First item</li>
        <li>Second item</li>
      </ul>
      <ol className="list-inside list-decimal space-y-2">
        <li>Numbered</li>
      </ol>
    </>
  ),
  Tabs: () => (
    <>
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    </>
  ),
  Accordion: () => (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="item1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  ),
  Collapse: () => (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="rounded border px-3 py-1 text-sm">
        Toggle
      </CollapsibleTrigger>
      <CollapsibleContent>Collapse content</CollapsibleContent>
    </Collapsible>
  ),
  Alert: () => (
    <>
      <Alert variant="default">
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is an alert message</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Error alert content</AlertDescription>
      </Alert>
    </>
  ),
  ScrollArea: () => (
    <>
      <ScrollArea className="h-52 w-72 border">
        <div className="p-4">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i}>Item {i + 1}</div>
          ))}
        </div>
      </ScrollArea>
    </>
  ),
  Notifications: () => (
    <button
      className="rounded border px-3 py-1 text-sm"
      onClick={() =>
        toast.success('Success', { description: 'Action completed' })
      }
    >
      Show toast
    </button>
  ),
  CopyButton: () => (
    <span className="text-sm text-muted-foreground">
      Needs custom build: use Button + navigator.clipboard.writeText() + local
      state management
    </span>
  ),
}
