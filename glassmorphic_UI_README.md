# Glassmorphic UI (holo panels)

Every interface surface is drawn as a translucent "holographic" pane over the live 3D canvas: the HUD chips and menus, the interaction prompt, the loading screen and the section panel. The look echoes the in-world cards, with deep navy glass, a hairline cyan rule, corner brackets, a `// 0X` header, glyph dividers and scanlines.

## Components

All primitives are in `src/components/ui/holo/`:

| Export                    | Renders                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HoloFrame` (default)     | A `div` with the glass panel, four corner brackets, an optional `// index` and `code` header, optional scanlines (on by default), and a `compact` variant with tighter padding and smaller brackets. It accepts all `div` attributes and a `ref`. |
| `GlyphRule`               | A row of `=` glyphs used as a divider (`aria-hidden`).                                                                                                                                                                                            |
| `HoloTrack`               | The progress track. Pass `value` for a React-controlled fill. Or pass `fillRef` to stream progress straight into the element's `transform` without re-rendering, as `InteractionPrompt` does for the hold-to-open charge.                         |
| `holoButtonClass(extra?)` | Class name for the bracketed `[ LABEL ]` mono button.                                                                                                                                                                                             |

They are used by `InteractionPrompt`, `LanguageSwitch`, `LoadingScreen`, `ModelDetailMenu`, `PortfolioOverlay`, `SectionContent` and `SectionIndex`.

## How the glass is built (`Holo.module.css`)

`.frame`:

- **Fill:** a vertical `linear-gradient` of semi-transparent navy stops layered over `var(--panel)` (`THEME.panel`, 84 % opaque navy).
- **Blur:** `backdrop-filter: blur(10px)` softens the world behind the panel.
- **Edge:** a `1px solid var(--line)` hairline and a 6 px radius.
- **Glow:** a three-part `box-shadow`: a faint outer ring, a blue outer glow and a faint inner cyan glow.

The other elements:

- **Brackets:** absolutely positioned spans with 2 px cyan borders on two sides, plus a cyan `drop-shadow`. `--bracket` sets their size.
- **Scanlines** (`.scanlines::after`): a repeating 3 px gradient blended with `mix-blend-mode: screen`. It ignores pointer events.
- **`.button`:** `var(--panel)` with `backdrop-filter: blur(8px)`, the same hairline, `[` and `]` pseudo-elements in cyan, and a stronger border, white text and glow on hover.

Panels can override the frame through its custom properties: `--pad` for padding and `--bracket` for bracket size. For example, `PortfolioOverlay.module.css` uses `.root .panel` to set a larger padding and bracket size, plus its own position and shadow.

## Low-quality fallback

`backdrop-filter` re-blurs the live canvas behind every panel on every frame. Without a GPU, that work runs on the CPU.

When the Experience considers the device constrained (software rendering, or the adaptive render scale had to drop), `Experience.publishQuality()` sets `<html data-quality="low">`. Otherwise it sets `"high"`. `Holo.module.css` responds with:

```css
:global(html[data-quality="low"]) .frame,
:global(html[data-quality="low"]) .button {
  backdrop-filter: none;
  background-color: var(--panel-solid);
}
```

On those devices panels become opaque (`THEME.panelSolid`), and the gradient overlay, border and brackets stay the same.

## Responsive behaviour

- At widths of 480 px or less, `.button` uses tighter padding, letter spacing and gap, so the HUD buttons fit on one row with the brand mark.
- The section panel docks to the right on viewports at least `OVERLAY_SIDE_PANEL_MIN_VIEWPORT_PX` wide (900 px). On narrower viewports it becomes a bottom sheet capped by `OVERLAY_SHEET_MAX_FRACTION` and `OVERLAY_SHEET_MAX_PX`. Both values are in `src/config/layout.ts`, and the camera uses the same values to keep the open card visible beside the panel.

## Accessibility notes

- Decorative parts are `aria-hidden`: the brackets, header, glyph rule and progress track.
- Keyboard focus uses the global `:focus-visible` cyan outline from `globals.css`.
- Text colour is `var(--text)` (`THEME.ink`, `#dbf4ff`) on navy glass. The blur and the 84 % fill keep the busy scene behind the panel from competing with the text, and the low-quality fallback makes the fill fully opaque.

## Limitations

- Several colours in this stylesheet are literal `rgba` values rather than theme tokens (see [THEME_SYSTEM_README.md](THEME_SYSTEM_README.md)).
- Browsers without `backdrop-filter` support show the translucent fill without blur. The project does not detect or handle this case separately.
