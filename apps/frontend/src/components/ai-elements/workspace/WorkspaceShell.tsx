'use client'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useMediaQuery } from '@/components/shadcn/hooks/use-media-query'
import { cn } from '@/components/shadcn/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/shadcn/ui/sheet'
import { workspaceTheme } from './theme'

interface WorkspaceShellContextValue {
  sidebarVisible: boolean
  showSidebar: () => void
  hideSidebar: () => void
  dismissOnMobile: () => void
}

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(
  null,
)

export const useWorkspaceShell = () => useContext(WorkspaceShellContext)

export interface WorkspaceShellProps {
  sidebar: ReactNode
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
  children: ReactNode
}

export function WorkspaceShell({
  sidebar,
  sidebarOpen,
  onSidebarOpenChange,
  children,
}: WorkspaceShellProps) {
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [sheetOpen, setSheetOpen] = useState(false)

  const value = useMemo<WorkspaceShellContextValue>(
    () => ({
      sidebarVisible: desktop ? sidebarOpen : sheetOpen,
      showSidebar: () =>
        desktop ? onSidebarOpenChange(true) : setSheetOpen(true),
      hideSidebar: () =>
        desktop ? onSidebarOpenChange(false) : setSheetOpen(false),
      dismissOnMobile: () => setSheetOpen(false),
    }),
    [desktop, sidebarOpen, sheetOpen, onSidebarOpenChange],
  )

  return (
    <WorkspaceShellContext.Provider value={value}>
      <div
        className={cn(
          workspaceTheme,
          'flex h-full min-h-0 w-full bg-(--ws-surface) text-(--ws-text)',
        )}
      >
        {desktop && sidebarOpen && (
          <aside
            aria-label="Conversations"
            className="flex w-80 shrink-0 flex-col border-r border-(--ws-sidebar-border) bg-(--ws-sidebar)"
          >
            {sidebar}
          </aside>
        )}
        {!desktop && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className={cn(
                workspaceTheme,
                'gap-0 bg-(--ws-sidebar) p-0 data-[side=left]:w-[min(20rem,88vw)] dark:bg-(--ws-surface)',
              )}
            >
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
        )}
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
    </WorkspaceShellContext.Provider>
  )
}
