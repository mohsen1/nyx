// Runs on the theme sharing page (site/theme/index.html). Lets the page offer a one-click import.

import { updateGlobal } from '../shared/settings';
import { updateSettings } from '../shared/storage';
import { newThemeId, parseThemeLink, type Theme } from '../shared/theme';

function init(): void {
  const button = document.getElementById('nyx-import') as HTMLButtonElement | null;
  document.documentElement.dataset.nyxInstalled = 'true';
  if (!button) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      const parsed = parseThemeLink(location.href);
      const theme: Theme = { ...parsed, id: newThemeId() };
      await updateSettings((s) => updateGlobal({ ...s, customThemes: [...s.customThemes, theme] }, {}));
      button.textContent = `Added “${theme.name}” to Nyx`;
      button.disabled = true;
    } catch (e) {
      button.textContent = e instanceof Error ? e.message : 'Could not import this theme.';
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
