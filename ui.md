# UI Guide — Colors & Typography

A practical, visual reference for the site's "holo-terminal" look: every
color and font actually in use, where it shows up, and how to use them
correctly in new work. For the engineering side (how tokens reach CSS and
WebGL, how to add a new one) see `THEME_SYSTEM_README.md` — this doc is the
design-facing companion to it.

The whole site is **one dark theme**. There is no light mode and no
runtime theme switching (`color-scheme: dark` is fixed in `globals.css`).

---

## 1. Color palette

### 1.1 Core tokens (`src/theme/theme.ts` → `THEME`)

This is the single source of truth. Both the React UI (as CSS custom
properties) and the Three.js world (imported directly) read from it.

| Swatch | Token                           | Value                             | CSS var         | Use it for                                                                                                  |
| ------ | ------------------------------- | --------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| 🟦⬛   | `bg`                            | `#04060b`                         | `--bg`          | Page background, scene background/fog, `<meta theme-color>`                                                 |
| 🟦     | `panel`                         | `rgba(6, 18, 40, 0.84)`           | `--panel`       | Glass fill of holo panels, buttons                                                                          |
| 🟦     | `panelSolid`                    | `#071226`                         | `--panel-solid` | Opaque fallback for `.frame`/`.button` on low-quality devices (no `backdrop-filter`)                        |
| 🩵     | `cyan`                          | `#5ff0ff`                         | `--cyan`        | **Primary signal color** — borders, glyphs, focus ring, active states, corner brackets                      |
| 🩵     | `cyanSoft`                      | `#8af0ff`                         | `--cyan-soft`   | Large luminous WebGL surfaces (logo, card-title glow). _Mapped to CSS but currently unused there — see §4._ |
| 🔵     | `blue`                          | `#2a8cff`                         | `--blue`        | Secondary accent — dashed frames, dim glyphs, footer text                                                   |
| 🟢     | `green`                         | `#3dff7a`                         | `--green`       | Brand accent only (logo piping, sneaker glow)                                                               |
| 🟩     | `teal` / `tealMid` / `tealDeep` | `#3fe0cf` / `#1b8f88` / `#0a2f2f` | — (WebGL only)  | Environment glyphs: floor, data blocks, rain, scene props                                                   |
| 🔷     | `deep`                          | `#0d2a4a`                         | `--deep`        | Low-intensity ASCII glyphs. _Mapped to CSS but currently unused there._                                     |
| ⬜     | `ink`                           | `#dbf4ff`                         | `--text`        | Body text                                                                                                   |
| ⬜     | `muted`                         | `#7d9cba`                         | `--muted`       | Secondary / de-emphasized text, labels, summaries                                                           |
| ░░     | `line`                          | `rgba(95, 240, 255, 0.28)`        | `--line`        | Hairline borders (the default, "resting" rule)                                                              |
| ▓▓     | `lineStrong`                    | `rgba(95, 240, 255, 0.85)`        | `--line-strong` | Hover/active hairline state                                                                                 |

**Rule of thumb:** cyan (`--cyan`) is the only color that says "this is
interactive / alive." Blue and green are accents, never used for
interaction state. If you're styling a button, link, or focus ring, it's
cyan — not blue.

### 1.2 Recurring "bright ink" tones (not yet tokenized)

A few components reach for near-white, near-cyan hex values instead of a
token, for text that needs to read brighter than `--text` (`#dbf4ff`) —
mainly large uppercase display titles and glowing labels:

| Value                 | Where it's used                                                     |
| --------------------- | ------------------------------------------------------------------- |
| `#e9fdff`             | HUD wordmark name, section panel `<h2>` title, loading-screen brand |
| `#c9f8ff` / `#c8fdff` | Interaction prompt text, WASD key "active" state stroke             |

These are the same idea every time (brightest tier of the cyan-white
family) but hand-typed per file rather than a shared variable. **If you
need this tone, match `#e9fdff`** — don't invent a fourth near-duplicate.
This is flagged as cleanup debt in `THEME_SYSTEM_README.md` §Limitations;
promoting it to a `--text-bright` token is the fix.

### 1.3 Plain black / white

`#fff` and `#000` (or `rgba(0,0,0,…)` / `rgba(255,255,255,…)`) show up
around a dozen times for things that are genuinely monochrome and don't
belong in the theme palette: SVG icon strokes (close button, expand
icon), `box-shadow`/`filter: invert(1)` recipes, and scrims. These are
fine as literals — they're not part of the color _identity_ of the site.

### 1.4 The "glass panel" recipe

Every holo surface (`HoloFrame`, buttons, HUD chips) is built from the
same layered recipe — reuse it rather than approximating it:

```css
background:
  linear-gradient(
    180deg,
    rgba(10, 32, 64, 0.55),
    rgba(6, 18, 40, 0.35) 55%,
    rgba(8, 26, 56, 0.5)
  ),
  var(--panel);
border: 1px solid var(--line);
border-radius: 6px;
box-shadow:
  0 0 0 1px rgba(95, 240, 255, 0.04),
  0 0 24px rgba(42, 140, 255, 0.14),
  inset 0 0 22px rgba(95, 240, 255, 0.05);
backdrop-filter: blur(10px);
```

On `html[data-quality="low"]` (set by the quality system for devices
without a capable GPU), drop the `backdrop-filter` and gradient, and fall
back to a flat `var(--panel-solid)` — see `Holo.module.css`.

**Scanline texture** (optional, on non-compact frames):

```css
background: repeating-linear-gradient(
  180deg,
  rgba(95, 240, 255, 0.035) 0 1px,
  transparent 1px 3px
);
mix-blend-mode: screen;
```

### 1.5 Border radius scale

| Radius | Used for                                            |
| ------ | --------------------------------------------------- |
| `50%`  | Circular nav buttons (lightbox prev/next)           |
| `14px` | Pill shapes (lightbox fraction counter)             |
| `6px`  | Panels, cards, buttons, frames — the default        |
| `4px`  | Small inline elements (screenshot tiles, "+N" tile) |
| `3px`  | Tiny chips (offline badge, skill chip)              |

### 1.6 Glow / shadow conventions

Interactive or emphasized elements get a soft cyan glow, not a hard
shadow — always `rgba(95, 240, 255, α)` or `rgba(42, 140, 255, α)`,
never a gray/black drop shadow:

```css
box-shadow: 0 0 16px rgba(95, 240, 255, 0.22); /* hover */
text-shadow: 0 0 22px rgba(95, 240, 255, 0.75); /* large glowing title */
filter: drop-shadow(0 0 4px rgba(95, 240, 255, 0.7)); /* corner brackets */
```

---

## 2. Typography

### 2.1 Font families (`src/theme/theme.ts` → `FONTS`)

Self-hosted via `@fontsource-variable/*`, imported once in
`src/app/[locale]/layout.tsx`.

| Stack     | Fonts (in order)                                           | CSS var                           | Role                                                         |
| --------- | ---------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `mono`    | JetBrains Mono Variable → Vazirmatn Variable → system mono | `--font-mono`                     | Labels, HUD, mono/terminal text, code-like UI                |
| `display` | Space Grotesk Variable → Vazirmatn Variable → system sans  | `--font-display`                  | Headings, titles, body copy                                  |
| `persian` | Vazirmatn Variable → Tahoma → sans                         | _(not mapped to CSS — see below)_ | Used directly in WebGL canvas textures for Persian card text |

**Vazirmatn is the glue.** Neither JetBrains Mono nor Space Grotesk ships
Persian glyphs, so both stacks list Vazirmatn as the fallback — Latin
characters render in the "real" face, Persian characters fall through to
Vazirmatn automatically, glyph by glyph, in the same line of text. You
never need to manually switch fonts for mixed EN/FA strings.

A fourth face, **Press Start 2P** (`@fontsource/press-start-2p`, weight
400 only), is imported but _not_ part of `FONTS` — it's a one-off, used
only for the pixel-art WASD key labels (`WASDGuide.module.css`) to sell
the "retro game" feel of the movement guide. Don't reach for it anywhere
else; it doesn't support Persian and isn't part of the type system.

### 2.2 Type scale (as actually used)

| Role                  | Font                         | Size                     | Weight         | Tracking                    | Example                                |
| --------------------- | ---------------------------- | ------------------------ | -------------- | --------------------------- | -------------------------------------- |
| Hero / section title  | `--font-display`             | `clamp(34px, 6vw, 48px)` | 700            | `0.04em`, uppercase         | Section panel `<h2>`                   |
| Card / HUD title      | `--font-display`             | 16px / 15px              | 700            | `0.04em` – `0.08em`         | Project card title, HUD wordmark       |
| Lead paragraph        | `--font-display` (inherited) | 15px                     | —              | normal, `line-height: 1.7`  | About intro                            |
| Body paragraph        | `--font-display` (inherited) | default                  | —              | normal                      | Card/section body copy                 |
| Eyebrow / group label | `--font-mono`                | 11–12.5px                | 600, uppercase | `0.12em`                    | `groupTitle`, `channelLabel`, `period` |
| HUD tagline / sub     | `--font-mono`                | 10–11px                  | —              | `0.14em`                    | HUD "`// portfolio.sys`"               |
| Code / index line     | `--font-mono`                | 13px                     | —              | normal                      | `// 0X` header, `> CODE` line          |
| ASCII block           | `--font-mono`                | 13px                     | 600            | normal, `line-height: 1.35` | Section panel ASCII art                |
| Footer / fine print   | `--font-mono`                | 11px                     | —              | normal                      | Panel footer                           |

Everything mono is uppercase-and-tracked (`letter-spacing`) by
convention — that's what reads as "terminal UI" here. Body/display text
is sentence case, untracked.

### 2.3 Persian (`:lang(fa)`) overrides

Persian text needs looser tracking and more line-height than Latin —
apply both whenever you add a new `:lang(fa)` rule for display text:

```css
:lang(fa) .title {
  letter-spacing: 0; /* tracked caps don't work for Arabic script */
  line-height: 1.35; /* -> up to 1.6–1.9 for longer copy/paragraphs */
}
```

Mono/eyebrow labels follow the same pattern (`letter-spacing: 0`, modest
`font-size` bump — see `.groupTitle`/`.channelLabel`/`.period` in
`SectionContent.module.css`).

---

## 3. Quick usage checklist

When styling something new:

1. **Reach for a CSS var first** (`var(--cyan)`, `var(--line)`, etc.),
   not a hex literal. Changing `THEME` should be enough to re-skin the
   site — a hardcoded value breaks that.
2. **Cyan = interactive.** Blue/green are accents only.
3. **Mono + uppercase + tracked** for labels and chrome; **display +
   sentence case** for things people read.
4. Borders are `var(--line)` at rest, `var(--line-strong)` or `var(--cyan)`
   on hover/focus — never a plain gray border.
5. Glows are cyan/blue `rgba`, never black. Standard panel shadow is the
   three-layer recipe in §1.4, not a one-off `box-shadow`.
6. New Persian-facing text needs an `:lang(fa)` override per §2.3.

---

## 4. Known gaps (for whoever picks these up)

- **`#e9fdff` / `#c9f8ff` / `#c8fdff`** (§1.2) should become a single
  `--text-bright` token.
- **`--cyan-soft` and `--deep`** are exposed as CSS vars but nothing in
  the stylesheets reads them yet (WebGL uses them directly from `THEME`).
- **~30 declarations** across the UI modules write `rgba(95, 240, 255, …)`
  / `rgba(42, 140, 255, …)` literally instead of deriving from `--cyan` /
  `--blue` at a given alpha — see `THEME_SYSTEM_README.md` §Limitations
  for the full accounting.
