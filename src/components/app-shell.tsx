import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { AppSidebar } from '#/components/app-sidebar'
import { Separator } from '#/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { LocaleProvider, useLocale } from '#/lib/i18n'

const pageTitles = {
  'en-US': { '/': 'Serial console', '/keys': 'Fruit keys' },
  'pt-BR': { '/': 'Console serial', '/keys': 'Teclas de frutas' },
}

const sidebarLabels = {
  'en-US': 'Toggle sidebar',
  'pt-BR': 'Abrir ou fechar barra lateral',
} as const

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <LocalizedAppShell>{children}</LocalizedAppShell>
    </LocaleProvider>
  )
}

function LocalizedAppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { locale } = useLocale()
  const pageTitle =
    pathname === '/'
      ? pageTitles[locale]['/']
      : pathname === '/keys'
        ? pageTitles[locale]['/keys']
        : 'Fruit Keyboard'

  useEffect(() => {
    document.title = `${pageTitle} | Fruit Keyboard`
  }, [pageTitle])

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger
              className="-ml-1"
              aria-label={sidebarLabels[locale]}
              title={sidebarLabels[locale]}
            />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <span className="text-sm font-medium">{pageTitle}</span>
          </header>
          <div className="min-w-0 flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
