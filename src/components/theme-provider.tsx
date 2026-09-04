import { createContext, useContext, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

type Theme = 'light' | 'dark'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme | ((current: Theme) => Theme)) => void
}

const initialState: ThemeProviderState = {
  theme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'arknote-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTheme(e.newValue as Theme)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen('toggle-app-theme', () => {
      const current = (localStorage.getItem(storageKey) as Theme) || 'light'
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem(storageKey, next)
      setTheme(next)
    }).then(fn => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [storageKey])

  const value = {
    theme,
    setTheme: (next: Theme | ((current: Theme) => Theme)) => {
      setTheme(current => {
        const resolved = typeof next === 'function' ? next(current) : next
        localStorage.setItem(storageKey, resolved)
        return resolved
      })
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
