/** Safari can pause animation frames while an extension popup is open. */
export function afterPaint(
  callback: () => void,
  win: Pick<Window, 'requestAnimationFrame' | 'setTimeout' | 'clearTimeout'> = window,
): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    win.clearTimeout(fallback);
    callback();
  };
  const fallback = win.setTimeout(finish, 150);
  win.requestAnimationFrame(() => { if (!done) win.requestAnimationFrame(finish); });
}
