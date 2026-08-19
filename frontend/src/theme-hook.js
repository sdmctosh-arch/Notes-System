import { useState, useEffect } from 'react';
import { getTheme, subscribeTheme } from './theme';

export function useDarkMode() {
  const [theme, setThemeState] = useState(getTheme());
  useEffect(() => subscribeTheme(setThemeState), []);
  return theme === 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState(getTheme());
  useEffect(() => subscribeTheme(setThemeState), []);
  return theme;
}
