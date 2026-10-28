# Website and system appearance audit — 28 October 2026

Visited 87 URLs and inspected real content on 59 distinct sites across 10 categories. Verification screens, login-only views, and extra pages from the same site are excluded from the minimum-50 count.

## Method

Loaded the built Chrome extension into a fresh Chromium profile at 1280 × 860, with Nyx On and the Dark theme. For every URL, captured the initial light-system rendering, switched to a dark system appearance, and switched back to light. Saved screenshots, visible-text contrast candidates, extension activity, resolved URLs, and browser/build metadata. Rejected optional cookies where an identifiable rejection control was available. Reviewed the screenshot contact sheets and probed flagged elements separately.

Coverage is public, unauthenticated desktop pages. Screenshots include cookie notices where they could not be dismissed reliably. Photos, maps, advertising images, and native dark-mode colors are not treated as ordinary CSS backgrounds. This is a website compatibility audit, not a comprehensive accessibility or Safari certification.

## Fixes

- [#6: system appearance changes override native dark mode](https://github.com/mohsen1/nyx/issues/6). The controller now re-detects original page colors before applying Nyx when the system changes appearance. Bounded follow-up checks catch sites that switch through later JavaScript callbacks. Detection also runs while Auto is inactive in daylight, preventing stale native-theme state. Four regressions cover Auto/On, CSS-only/delayed JavaScript, and repeated light → dark → light → dark changes. The two CSS cases were run against the previous controller and failed; all four cases pass with the fix.

- [#7: contrast repairs disappear on color transitions](https://github.com/mohsen1/nyx/issues/7). ESPN exposed a repaired Log In label dropping to 2.91:1 contrast after a theme change. The guard now checks animations before removing repairs and suppresses transitions only during measurement/restoration. A focused text-change regression failed before the fix and passes afterward. A fresh ESPN probe after dark → light reports the repair present, no running animation, and approximately 4.99:1 contrast.

Existing local Google Sheets canvas and Gmail sprite fixes remain in the checkout and their regressions pass. The changes are local and rebuilt; issues remain open pending commit/release.

## Verification

- TypeScript check passed; all 94 unit tests and all 39 Chromium extension end-to-end tests passed.
- The final live sweep completed all 87 URLs with the same frozen extension bundle; its SHA-256 matches the current rebuilt content script.
- Live transitions showed Nyx yielding to native dark mode and resuming on light pages, including GitHub, Medium, Python docs, MDN, Go, Ruby, OpenStreetMap, Wikipedia, and FreeBSD.
- Remaining automated candidates were triaged: LinkedIn initial color transitions settle to readable text in a later probe; Smithsonian’s `search` text is 0px fallback content inside a mask icon; Substack/OpenStreetMap button contrast and faded Reddit login text were measured while Nyx was inactive in native dark mode. Those native colors were preserved.

Browser: `chromium 141.0.7390.37`. Final run: `2026-10-28T08:40:34.343Z` to `2026-10-28T08:44:07.217Z`.
Content-script SHA-256: `27d93787a6d0b8df62ff31c271d498ef03f87d0d7077cf0695bb281e103b8798`.

Generated local evidence is under `audit-results/2026-10-28/verified/`: `results.json`, `run.json`, three PNGs per URL, and five screenshot contact sheets. The directory is intentionally Git-ignored. The audited extension is frozen in `audit-results/2026-10-28/extension-verified/`.

## Sites counted toward the minimum

| Category | Website | Native dark mode used after night switch |
| --- | --- | --- |
| News and communities | [reddit.com](https://www.reddit.com/r/programming/) | Yes |
| News and communities | [news.ycombinator.com](https://news.ycombinator.com/item?id=1) | Nyx active |
| News and communities | [edition.cnn.com](https://edition.cnn.com/) | Nyx active |
| News and communities | [medium.com](https://medium.com/) | Yes |
| News and communities | [theverge.com](https://www.theverge.com/) | Nyx active |
| News and communities | [dev.to](https://dev.to/) | Nyx active |
| Reference and education | [en.wikipedia.org](https://en.wikipedia.org/wiki/Moon) | Nyx active |
| Reference and education | [archive.org](https://archive.org/) | Nyx active |
| Reference and education | [gutenberg.org](https://www.gutenberg.org/) | Nyx active |
| Reference and education | [khanacademy.org](https://www.khanacademy.org/) | Nyx active |
| Reference and education | [edx.org](https://www.edx.org/) | Nyx active |
| Reference and education | [wolframalpha.com](https://www.wolframalpha.com/) | Nyx active |
| Development and operating systems | [github.com](https://github.com/microsoft/vscode) | Yes |
| Development and operating systems | [docs.python.org](https://docs.python.org/3/tutorial/index.html) | Yes |
| Development and operating systems | [developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/CSS) | Yes |
| Development and operating systems | [npmjs.com](https://www.npmjs.com/package/react) | Nyx active |
| Development and operating systems | [gnu.org](https://www.gnu.org/) | Nyx active |
| Development and operating systems | [rust-lang.org](https://www.rust-lang.org/) | Nyx active |
| Development and operating systems | [go.dev](https://go.dev/) | Yes |
| Development and operating systems | [ruby-lang.org](https://www.ruby-lang.org/en/) | Yes |
| Development and operating systems | [debian.org](https://www.debian.org/) | Nyx active |
| Development and operating systems | [kernel.org](https://www.kernel.org/) | Nyx active |
| Development and operating systems | [sqlite.org](https://www.sqlite.org/) | Nyx active |
| Development and operating systems | [freebsd.org](https://www.freebsd.org/) | Yes |
| Public services and science | [gov.uk](https://www.gov.uk/) | Nyx active |
| Public services and science | [nhs.uk](https://www.nhs.uk/) | Nyx active |
| Public services and science | [who.int](https://www.who.int/) | Nyx active |
| Public services and science | [un.org](https://www.un.org/en/) | Nyx active |
| Public services and science | [weather.gov](https://www.weather.gov/) | Nyx active |
| Public services and science | [nasa.gov](https://www.nasa.gov/) | Nyx active |
| Culture and photography | [metmuseum.org](https://www.metmuseum.org/) | Nyx active |
| Culture and photography | [si.edu](https://www.si.edu/) | Nyx active |
| Culture and photography | [loc.gov](https://www.loc.gov/) | Yes |
| Culture and photography | [xkcd.com](https://xkcd.com/) | Nyx active |
| Culture and photography | [flickr.com](https://www.flickr.com/) | Nyx active |
| Culture and photography | [nationalgeographic.com](https://www.nationalgeographic.com/) | Nyx active |
| Shopping, listings, and cooking | [amazon.com](https://www.amazon.com/) | Nyx active |
| Shopping, listings, and cooking | [craigslist.org](https://craigslist.org/) | Nyx active |
| Shopping, listings, and cooking | [pinterest.com](https://www.pinterest.com/) | Nyx active |
| Shopping, listings, and cooking | [ikea.com](https://www.ikea.com/us/en/) | Nyx active |
| Shopping, listings, and cooking | [allrecipes.com](https://www.allrecipes.com/) | Nyx active |
| Shopping, listings, and cooking | [seriouseats.com](https://www.seriouseats.com/) | Nyx active |
| Travel and maps | [airbnb.com](https://www.airbnb.com/) | Nyx active |
| Travel and maps | [bahn.de](https://www.bahn.de/) | Nyx active |
| Travel and maps | [openstreetmap.org](https://www.openstreetmap.org/) | Yes |
| Travel and maps | [lonelyplanet.com](https://www.lonelyplanet.com/) | Nyx active |
| Products and services | [apple.com](https://www.apple.com/) | Yes |
| Products and services | [notion.com](https://www.notion.com/) | Nyx active |
| Products and services | [stripe.com](https://stripe.com/docs) | Nyx active |
| Products and services | [paypal.com](https://www.paypal.com/) | Nyx active |
| Products and services | [figma.com](https://www.figma.com/) | Nyx active |
| Products and services | [dropbox.com](https://www.dropbox.com/) | Nyx active |
| Products and services | [slack.com](https://slack.com/) | Nyx active |
| Products and services | [twitch.tv](https://www.twitch.tv/) | Nyx active |
| Products and services | [mozilla.org](https://www.mozilla.org/) | Nyx active |
| Products and services | [cloudflare.com](https://www.cloudflare.com/) | Nyx active |
| Search | [bing.com](https://www.bing.com/) | Nyx active |
| Search | [duckduckgo.com](https://duckduckgo.com/?q=dark+mode) | Nyx active |
| Sports | [espn.com](https://www.espn.com/) | Nyx active |

## All visited URLs

| URL | Counted toward minimum |
| --- | --- |
| https://archive.org/ | Yes |
| https://arstechnica.com/ | No: extra page or restricted/overlay view |
| https://craigslist.org/ | Yes |
| https://dev.to/ | Yes |
| https://developer.mozilla.org/en-US/docs/Web/CSS | Yes |
| https://docs.python.org/3/tutorial/index.html | Yes |
| https://duckduckgo.com/?q=dark+mode | Yes |
| https://edition.cnn.com/ | Yes |
| https://en.wikipedia.org/wiki/Moon | Yes |
| https://github.com/microsoft/vscode | Yes |
| https://go.dev/ | Yes |
| https://medium.com/ | Yes |
| https://news.ycombinator.com/item?id=1 | Yes |
| https://old.reddit.com/r/programming/ | No: extra page or restricted/overlay view |
| https://slack.com/ | Yes |
| https://stackoverflow.com/questions/11227809 | No: extra page or restricted/overlay view |
| https://stripe.com/docs | Yes |
| https://substack.com/ | No: extra page or restricted/overlay view |
| https://www.airbnb.com/ | Yes |
| https://www.allrecipes.com/ | Yes |
| https://www.amazon.com/ | Yes |
| https://www.apple.com/ | Yes |
| https://www.bahn.de/ | Yes |
| https://www.bbc.com/news | No: extra page or restricted/overlay view |
| https://www.bing.com/ | Yes |
| https://www.booking.com/ | No: extra page or restricted/overlay view |
| https://www.cloudflare.com/ | Yes |
| https://www.coursera.org/ | No: extra page or restricted/overlay view |
| https://www.craigslist.org/about/ | No: extra page or restricted/overlay view |
| https://www.debian.org/ | Yes |
| https://www.dropbox.com/ | Yes |
| https://www.ebay.com/ | No: extra page or restricted/overlay view |
| https://www.economist.com/ | No: extra page or restricted/overlay view |
| https://www.edx.org/ | Yes |
| https://www.espn.com/ | Yes |
| https://www.etsy.com/ | No: extra page or restricted/overlay view |
| https://www.figma.com/ | Yes |
| https://www.flickr.com/ | Yes |
| https://www.freebsd.org/ | Yes |
| https://www.gnu.org/ | Yes |
| https://www.google.com/search?q=dark+mode | No: extra page or restricted/overlay view |
| https://www.gov.uk/ | Yes |
| https://www.gutenberg.org/ | Yes |
| https://www.ikea.com/us/en/ | Yes |
| https://www.imdb.com/ | No: extra page or restricted/overlay view |
| https://www.kernel.org/ | Yes |
| https://www.khanacademy.org/ | Yes |
| https://www.linkedin.com/ | No: extra page or restricted/overlay view |
| https://www.linkedin.com/company/microsoft | No: extra page or restricted/overlay view |
| https://www.linkedin.com/pulse/topics/home/ | No: extra page or restricted/overlay view |
| https://www.loc.gov/ | Yes |
| https://www.lonelyplanet.com/ | Yes |
| https://www.metmuseum.org/ | Yes |
| https://www.microsoft.com/en-us/ | No: extra page or restricted/overlay view |
| https://www.mozilla.org/ | Yes |
| https://www.nasa.gov/ | Yes |
| https://www.nationalgeographic.com/ | Yes |
| https://www.nhs.uk/ | Yes |
| https://www.notion.com/ | Yes |
| https://www.npmjs.com/package/react | Yes |
| https://www.nytimes.com/ | No: extra page or restricted/overlay view |
| https://www.openstreetmap.org/ | Yes |
| https://www.patagonia.com/ | No: extra page or restricted/overlay view |
| https://www.paypal.com/ | Yes |
| https://www.pinterest.com/ | Yes |
| https://www.quora.com/ | No: extra page or restricted/overlay view |
| https://www.reddit.com/r/programming/ | Yes |
| https://www.ruby-lang.org/en/ | Yes |
| https://www.rust-lang.org/ | Yes |
| https://www.seriouseats.com/ | Yes |
| https://www.si.edu/ | Yes |
| https://www.spiegel.de/ | No: extra page or restricted/overlay view |
| https://www.sqlite.org/ | Yes |
| https://www.ted.com/ | No: extra page or restricted/overlay view |
| https://www.theguardian.com/international | No: extra page or restricted/overlay view |
| https://www.theverge.com/ | Yes |
| https://www.twitch.tv/ | Yes |
| https://www.un.org/en/ | Yes |
| https://www.w3.org/ | No: extra page or restricted/overlay view |
| https://www.weather.gov/ | Yes |
| https://www.who.int/ | Yes |
| https://www.wikipedia.org/ | No: extra page or restricted/overlay view |
| https://www.wired.com/ | No: extra page or restricted/overlay view |
| https://www.wolframalpha.com/ | Yes |
| https://www.yelp.com/ | No: extra page or restricted/overlay view |
| https://www.youtube.com/ | No: extra page or restricted/overlay view |
| https://xkcd.com/ | Yes |
