import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'lumix-theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// Oscuro es el default fijo para quien nunca eligio nada -es como se ve Lumix hoy, y no debe
// cambiar solo por el prefers-color-scheme del sistema operativo de cada uno-. El tema claro es
// 100% opt-in: solo se activa si la persona lo elige a mano (y despues persiste en
// localStorage, por dispositivo).
function leerThemeGuardado(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const guardado = window.localStorage.getItem(STORAGE_KEY)
  return guardado === 'light' ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(leerThemeGuardado)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
