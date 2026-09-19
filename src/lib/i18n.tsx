import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type Locale = 'en-US' | 'pt-BR'

const localeStorageKey = 'fruit-keyboard-locale'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('pt-BR')

  useEffect(() => {
    try {
      const storedLocale = window.localStorage.getItem(localeStorageKey)
      if (storedLocale === 'en-US' || storedLocale === 'pt-BR') {
        setLocale(storedLocale)
      }
    } catch {
      // The default locale remains available when storage is blocked.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    try {
      window.localStorage.setItem(localeStorageKey, locale)
    } catch {
      // The selected locale still works for this session.
    }
  }, [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider.')
  return context
}
