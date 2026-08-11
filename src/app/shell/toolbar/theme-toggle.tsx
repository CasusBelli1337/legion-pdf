/**
 * Light/dark switch. It shows the theme it will move to, which is the
 * convention every browser and OS uses, and it takes effect on the click —
 * no reload, because every colour in the app is a variable.
 */

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, currentTheme, otherTheme, switchThemeLabel } from '../../theme';
import { TOOLBAR_BUTTON } from './toolbar-classes';

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const target = otherTheme(theme);
  const Icon = target === 'dark' ? Moon : Sun;
  const label = switchThemeLabel(target);

  return (
    <button
      type="button"
      className={TOOLBAR_BUTTON}
      onClick={() => {
        applyTheme(target);
        setTheme(target);
      }}
      aria-label={label}
      title={label}
    >
      <Icon size={14} aria-hidden />
    </button>
  );
}
