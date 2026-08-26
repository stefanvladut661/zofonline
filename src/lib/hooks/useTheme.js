import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zof-theme') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('zof-theme', theme);
  }, [theme]);

  const toggleTheme = () => setThemeState(t => t === 'dark' ? 'light' : 'dark');
  const setTheme = (t) => setThemeState(t);

  return { theme, toggleTheme, setTheme };
}