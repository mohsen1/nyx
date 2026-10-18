# Writing style

How we write Nyx's README, website and App Store listing. The reader is
someone deciding whether to install a browser extension. They want to know
what it does, whether it will break the sites they use, and whether it
watches them. Answer those plainly and stop.

## Cut these

- **Sales words.** Seamless, effortless, powerful, robust, beautiful,
  stunning, elevate, unlock, enhance, experience, delve, crucial. Say what
  happens on the screen instead.
- **"Not X, it's Y."** Also "not just X, but Y". Only contrast with something
  a reader actually believes. "Nyx doesn't invert pages" earns its place
  once, because inverting is what people expect. After that, just describe
  what it does.
- **Groups of three by reflex.** Three adjectives, three benefit cards, three
  short clauses in a row. If there are two real points, write two. If there
  are seven, list seven.
- **Dashes as glue.** Use a period, comma, colon or parentheses. A dash now
  and then is fine; one per paragraph is too many.
- **Bold-label bullet walls.** "**Fast.** Loads quickly." repeated five times
  reads like a template. Write a sentence, or a plain list with no labels.
- **Title Case Headings.** Use sentence case. Headings should say what the
  section is about, and the first sentence shouldn't repeat them.
- **Emoji and decoration** in text, headings or bullets.
- **Fake depth.** Openers and closers built to be quoted ("Your eyes deserve
  better."), summaries that restate the page, sign-offs.
- **Throat-clearing and filler.** "It's worth noting", "simply", "just",
  "whether you're X or Y".
- **Hedges and vague claims.** "May help improve readability." Either it does
  or say what it does. Also watch for "every", "always", "never" when they
  aren't true.
- **Avoiding plain verbs.** "Serves as", "features", "boasts", "offers" where
  "is" or "has" works.
- **Things acting like people.** "Nyx understands your page." It reads the
  stylesheets. Say that.

## Do this

- Open with what it is and what it does, in one sentence.
- Use specifics we can check: 26 built-in themes, the 20:00 to 07:00 default
  schedule, the actual menu item names, the actual settings path.
- Mix short and long sentences. Let a paragraph end on a fact.
- Use lists for things that really are lists: steps, theme names, shortcuts.
  Use prose for explanations.
- Be honest about scope. Say what's not done yet (the App Store release) and
  what Nyx does on the network (it re-fetches the page's own stylesheets and
  images, nothing else).
- Talk to the reader as "you". Keep the tone of a person explaining their
  project to a friend.
- Check every claim against the code, [DEVELOPMENT.md](../DEVELOPMENT.md) and
  [architecture.md](architecture.md) before publishing.

## Sources

Paraphrased and trimmed from:

- Wikipedia editors, [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
- Siqi Chen, [humanizer](https://github.com/blader/humanizer), a Claude Code
  skill based on the Wikipedia list
- Hardik Pandya, [stop-slop](https://github.com/hardikpandya/stop-slop), a
  writing skill with phrase and structure rules
