import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AppSidebar } from '#/components/app-sidebar'
import { Separator } from '#/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'

const pageTitles: Record<string, string> = {
  '/': 'Serial console',
  '/keys': 'Fruit keys',
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <span className="text-sm font-medium">
              {pageTitles[pathname] ?? 'Fruit Keyboard'}
            </span>
          </header>
          <div className="min-w-0 flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
