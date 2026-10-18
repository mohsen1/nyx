// Before/after viewer on the home page: drag the diagonal seam, or pick another website.
(() => {
  const root = document.querySelector('[data-compare]');
  if (!root) return;
  const frame = root.querySelector('.compare-frame');
  const range = root.querySelector('[data-range]');
  const light = root.querySelector('[data-light]');
  const nyx = root.querySelector('[data-nyx]');
  const lightPhone = root.querySelector('[data-light-phone]');
  const nyxPhone = root.querySelector('[data-nyx-phone]');
  const caption = root.querySelector('[data-caption-text]');
  const buttons = [...root.querySelectorAll('[data-site]')];
  // The seam leans 6% of the width each way from its midpoint (matches --lean in style.css).
  const LEAN = 6;
  const MIN = 4;
  const MAX = 96;

  const set = (value) => {
    const v = Math.min(MAX, Math.max(MIN, value));
    frame.style.setProperty('--pos', `${v}%`);
    range.value = String(Math.round(v));
  };

  range.addEventListener('input', () => set(Number(range.value)));

  // Keep the seam's angle exact for the frame's current shape.
  const tilt = () => {
    const r = frame.getBoundingClientRect();
    if (r.height) frame.style.setProperty('--tilt', `${-Math.atan(((2 * LEAN) / 100) * (r.width / r.height))}rad`);
  };
  tilt();
  new ResizeObserver(tilt).observe(frame);

  // Dragging anywhere on the picture moves the seam to the pointer, accounting for its lean.
  const fromPointer = (e) => {
    const r = frame.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = (e.clientY - r.top) / r.height;
    set(x - LEAN * (1 - 2 * y));
  };
  let dragging = false;
  frame.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    frame.classList.add('is-dragging');
    frame.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  frame.addEventListener('pointermove', (e) => dragging && fromPointer(e));
  const stop = () => {
    dragging = false;
    frame.classList.remove('is-dragging');
  };
  frame.addEventListener('pointerup', stop);
  frame.addEventListener('pointercancel', stop);

  const sources = (site, variant) => ({
    src: `images/compare/${site}-${variant}.webp`,
    srcset: `images/compare/${site}-${variant}-1280.webp 1280w, images/compare/${site}-${variant}.webp 2560w`,
  });
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const site = button.dataset.site;
      for (const b of buttons) b.setAttribute('aria-checked', String(b === button));
      Object.assign(light, sources(site, 'light'));
      Object.assign(nyx, sources(site, 'nyx'));
      lightPhone.srcset = `images/compare/${site}-light-m.webp`;
      nyxPhone.srcset = `images/compare/${site}-nyx-m.webp`;
      caption.textContent = button.dataset.caption;
    });
  }
  // Arrow keys move between sites, as in a native segmented control.
  root.querySelector('.segmented').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.click();
    next.focus();
    e.preventDefault();
  });

  // Warm the other sites' images once the page is idle.
  const warm = () => {
    const phone = matchMedia('(max-width: 640px)').matches;
    for (const b of buttons.slice(1)) {
      for (const v of ['light', 'nyx']) {
        const img = new Image();
        if (phone) img.src = `images/compare/${b.dataset.site}-${v}-m.webp`;
        else {
          img.srcset = sources(b.dataset.site, v).srcset;
          img.sizes = light.sizes;
        }
      }
    }
  };
  ('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(warm);

  // On first view the seam sweeps in from the right once, so the page shows what it does.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const rest = Number(range.value);
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const from = 92;
    const start = performance.now();
    const duration = 1400;
    const step = (now) => {
      if (dragging) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      set(from + (rest - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    set(from);
    requestAnimationFrame(step);
  }, { threshold: 0.4 });
  io.observe(frame);
})();
