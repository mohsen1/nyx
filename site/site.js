// Small enhancements for the Nyx website. Everything works without this file:
// the screenshot window shows a fixed split, and the site and theme pickers are plain radio buttons.
(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Light/dark toggle for this website. Follows the system until you pick one.
  const lamp = document.querySelector('.lamp');
  if (lamp) {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : system.matches);
    const sync = () => lamp.setAttribute('aria-pressed', String(isDark()));
    lamp.hidden = false;
    sync();
    lamp.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('nyx-site-theme', next); } catch {}
      sync();
    });
    system.addEventListener?.('change', sync);
  }

  // The screenshot window: the line between the page as it ships and the page with Nyx.
  const viewer = document.querySelector('.viewer');
  if (!viewer) return;
  const range = viewer.querySelector('.seam-range');
  const SLANT = 0.12; // the line runs from p + 12% at the top to p - 12% at the bottom
  const MIN = -SLANT, MAX = 1 + SLANT;
  let p = 0.5;
  let intro = 0;

  const set = (value) => {
    p = Math.min(MAX, Math.max(MIN, value));
    viewer.style.setProperty('--p', p.toFixed(4));
    const shown = Math.round(Math.min(1, Math.max(0, 1 - p)) * 100);
    range.value = String(Math.round(((p - MIN) / (MAX - MIN)) * 100));
    range.setAttribute('aria-valuetext', `${shown}% of the page with Nyx`);
  };
  const stopIntro = () => { if (intro) cancelAnimationFrame(intro); intro = 0; };

  range.hidden = false;
  range.addEventListener('input', () => {
    stopIntro();
    set(MIN + (Number(range.value) / 100) * (MAX - MIN));
  });

  // Put the line under the pointer, at the pointer's height.
  const fromPointer = (e) => {
    const r = viewer.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    set(x - SLANT + 2 * SLANT * y);
  };
  let dragging = null;
  viewer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stopIntro();
    dragging = e.pointerId;
    // A touch might be the start of a vertical scroll, so wait for movement before jumping.
    if (e.pointerType !== 'touch') {
      viewer.setPointerCapture(e.pointerId);
      fromPointer(e);
    }
  });
  viewer.addEventListener('pointermove', (e) => {
    if (dragging !== e.pointerId) return;
    if (e.pointerType === 'touch' && !viewer.hasPointerCapture(e.pointerId)) viewer.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  const end = (e) => { if (dragging === e.pointerId) dragging = null; };
  viewer.addEventListener('pointerup', end);
  viewer.addEventListener('pointercancel', end);

  // Once the window is on screen, dusk moves across it from the right.
  if (reduceMotion.matches || !('IntersectionObserver' in window)) { set(0.5); return; }
  set(MAX);
  const img = viewer.querySelector('.shot img.nyx');
  const start = () => {
    if (p !== MAX) return; // someone already moved the line
    const from = MAX, to = 0.5, duration = 1700;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      set(from + (to - from) * eased);
      intro = t < 1 ? requestAnimationFrame(step) : 0;
    };
    intro = requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    io.disconnect();
    const go = () => setTimeout(start, 250);
    if (img && !img.complete) img.addEventListener('load', go, { once: true });
    else go();
  }, { threshold: 0.6 });
  io.observe(viewer);
})();
