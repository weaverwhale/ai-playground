import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return (
      saved ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light')
    );
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label={`Toggle theme from ${theme} to ${theme === 'dark' ? 'light' : 'dark'}`}
      title={`Toggle theme from ${theme} to ${theme === 'dark' ? 'light' : 'dark'}`}
    >
      {theme === 'dark' ? '🌚' : '🌝'}
    </button>
  );
}
