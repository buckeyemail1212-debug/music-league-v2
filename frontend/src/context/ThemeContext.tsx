import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeName = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  surface: string;
  pill: string;
  pillBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  border: string;
  icon: string;
  iconMuted: string;
  inputBg: string;
  skeleton: string;
}

const DARK: ThemeColors = {
  background: '#121212',
  surface: '#181818',
  pill: '#282828',
  pillBorder: 'transparent',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  accent: '#7C3AED',
  border: 'rgba(255,255,255,0.1)',
  icon: '#FFFFFF',
  iconMuted: '#B3B3B3',
  inputBg: '#3E3E3E',
  skeleton: '#2A2A2A',
};

const LIGHT: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F2F2F2',
  pill: '#EFEFEF',
  pillBorder: 'rgba(0,0,0,0.08)',
  textPrimary: '#1A1A1A',
  textSecondary: '#6A6A6A',
  accent: '#7C3AED',
  border: 'rgba(0,0,0,0.1)',
  icon: '#1A1A1A',
  iconMuted: '#6A6A6A',
  inputBg: '#F2F2F2',
  skeleton: '#E5E5E5',
};

const PALETTES: Record<ThemeName, ThemeColors> = { dark: DARK, light: LIGHT };

interface ThemeContextType {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = 'app-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') setThemeState(saved);
      } catch {}
    })();
  }, []);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, colors: PALETTES[theme], setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
