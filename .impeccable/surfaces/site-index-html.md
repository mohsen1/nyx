---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: ["site/style.css","site/privacy/index.html","site/support/index.html"]
---

# Website (site/)

Scope: the public marketing site at https://azimi.me/nyx/ (index, privacy, support; theme/ stays as the theme-link landing). Visitor mode: Persuade.

Audience and job: someone who reads at night in Safari and is weighing a dark mode extension. Their job is to understand what Nyx does and trust it (private, open source, keeps sites recognizable); installing is secondary until store listings exist. Proof: real websites before and after, the real 26-theme library, the real popup. Constraints: static HTML/CSS with a little vanilla JS; plain, specific copy per docs/writing-style.md; never name the other dark mode app; keep SEO metadata, canonical URLs and all routes; correct in light and dark.

Reference bar (user-chosen): apple.com product pages, Things 3 (Cultured Code), Panic (Nova, Transmit). Canon executed at full fidelity, user-pinned.

## Direction contract

THESIS: A quiet Apple-style product page whose first viewport is the product working: a real website you can wipe from light to Nyx with one draggable diagonal seam. It refuses the dark SaaS template (eyebrows, violet glow, a grid of equal feature cards).

OWN-WORLD: The site follows the visitor's appearance. Light: white page, #f5f5f7 bands, ink #1d1d1f, secondary #6e6e73. Dark: #000 page, #161617 bands, ink #f5f5f7, secondary #a1a1a6. One tint, Nyx indigo (#5856d6 light, #7d7aff dark) for links and the primary button only. SF Pro via system stack, display 600 weight with tight tracking, generous whitespace, 18px radius imagery with soft offset shadows, pill buttons, hairline separators, Lucide-stroke icons only where they label.

STORY: Visitors see Nyx darken a real page, learn it keeps each site's own colors, browse the 26 real themes, see how small the per-site menu is, read that nothing leaves the device, then find how to install.

FIRST VIEWPORT: Nav bar (icon + Nyx left; How it works, Themes, Privacy, Support, GitHub right). Centered headline "Dark mode for websites that don't have one." (~72px desktop), one-line subhead, two actions: "Get Nyx" pill (primary, to install) and "See how it works" link. Below, at near full content width, the compare frame: one real site, light and Nyx stacked, with a draggable diagonal seam and a round handle; a small segmented control under it switches Hacker News, Craigslist and xkcd (Paul Graham's essay was cut: its pale header GIF stays bright under Nyx and undercuts the proof; old.reddit blocks automated capture). Phones get phone-width 2:3 captures of the same sites.

FORM: Canon (user-pinned conventional, apple.com/Things/Panic bar); no concept-seed roll because the user pinned the direction; seed key: none (user-pinned canon). Signature interaction: drag the seam (pointer, touch, keyboard via a range input); on first view the seam eases once from the right edge to rest. Motion grammar: one entrance on the compare frame, exponential ease-out, disabled under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
