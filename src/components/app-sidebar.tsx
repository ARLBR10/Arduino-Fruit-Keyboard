import { Link, useRouterState } from '@tanstack/react-router'
import {
  AudioLines,
  CircuitBoard,
  Languages,
  TerminalSquare,
} from 'lucide-react'
import type { ComponentProps } from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '#/components/ui/sidebar'
import { Button } from '#/components/ui/button'
import { useLocale } from '#/lib/i18n'

const copy = {
  'en-US': {
    subtitle: 'Arduino instrument',
    workspace: 'Workspace',
    console: 'Serial console',
    keys: 'Fruit keys',
    language: 'Language',
    changeLanguage: 'Switch language to Portuguese (Brazil)',
    sidebar: 'Sidebar',
    sidebarDescription: 'Displays the mobile sidebar.',
    toggleSidebar: 'Toggle sidebar',
  },
  'pt-BR': {
    subtitle: 'Instrumento Arduino',
    workspace: 'Área de trabalho',
    console: 'Console serial',
    keys: 'Teclas de frutas',
    language: 'Idioma',
    changeLanguage: 'Mudar idioma para inglês (Estados Unidos)',
    sidebar: 'Barra lateral',
    sidebarDescription: 'Exibe a barra lateral em dispositivos móveis.',
    toggleSidebar: 'Abrir ou fechar barra lateral',
  },
} as const

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { locale, setLocale } = useLocale()
  const text = copy[locale]
  const navigation = [
    { title: text.console, to: '/', icon: TerminalSquare },
    { title: text.keys, to: '/keys', icon: AudioLines },
  ] as const

  return (
    <Sidebar
      collapsible="offcanvas"
      mobileTitle={text.sidebar}
      mobileDescription={text.sidebarDescription}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Fruit Keyboard"
              render={<Link to="/" />}
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <CircuitBoard />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Fruit Keyboard</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {text.subtitle}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{text.workspace}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={pathname === item.to}
                    tooltip={item.title}
                    render={<Link to={item.to} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Languages className="size-4 shrink-0" />
            <span className="truncate">{text.language}</span>
          </span>
          <Button
            type="button"
            role="switch"
            aria-checked={locale === 'pt-BR'}
            aria-label={text.changeLanguage}
            variant="outline"
            size="sm"
            className="h-7 min-w-16 px-2 font-mono text-xs"
            onClick={() => setLocale(locale === 'en-US' ? 'pt-BR' : 'en-US')}
          >
            {locale === 'en-US' ? 'EN-US' : 'PT-BR'}
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail aria-label={text.toggleSidebar} title={text.toggleSidebar} />
    </Sidebar>
  )
}
