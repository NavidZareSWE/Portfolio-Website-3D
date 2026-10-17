# Theme system

The site has one dark "holo-terminal" theme. One module, `src/theme/theme.ts`, defines its colours and fonts, and both the React interface and the Three.js world read them from there. There is no light theme and no runtime theme switching.

## Where the tokens live

`src/theme/theme.ts` exports:

- `THEME`: colour values (hex or `rgba` strings).
- `FONTS`: three font stacks: `mono`, `display` and `persian`.
- `themeCssVariables()`: maps a subset of those tokens to CSS custom properties.

| Token                         | Value                                                  | Used for                                                                    |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `bg`                          | `#04060b`                                              | Page background, scene background and fog colour, glyph fog colour          |
| `panel`                       | `rgba(6, 18, 40, 0.84)`                                | Translucent glass fill of holo panels and buttons                           |
| `panelSolid`                  | `#071226`                                              | Opaque fill used instead of glass on constrained devices                    |
| `cyan`                        | `#5ff0ff`                                              | Primary signal colour: borders, glyphs, focus ring, active states           |
| `cyanSoft`                    | `#8af0ff`                                              | Large luminous surfaces in WebGL (logo, card title glow)                    |
| `blue`                        | `#2a8cff`                                              | Secondary accent                                                            |
| `green`                       | `#3dff7a`                                              | Brand accent (logo, piping, sneaker glow)                                   |
| `teal`, `tealMid`, `tealDeep` | `#3fe0cf`, `#1b8f88`, `#0a2f2f`                        | Environment glyphs (floor, data blocks, rain, scene materials). WebGL only. |
| `deep`                        | `#0d2a4a`                                              | Low-intensity ASCII glyphs                                                  |
| `ink`                         | `#dbf4ff`                                              | Body text                                                                   |
| `muted`                       | `#7d9cba`                                              | Secondary text                                                              |
| `line`, `lineStrong`          | `rgba(95, 240, 255, 0.28)`, `rgba(95, 240, 255, 0.85)` | Hairline rules and their hover state                                        |

## How the tokens reach CSS

1. `src/app/[locale]/layout.tsx` renders `<html style={themeCssVariables()}>`. Every page therefore has these properties on its root element:

   `--bg`, `--panel`, `--panel-solid`, `--cyan`, `--cyan-soft`, `--blue`, `--green`, `--deep`, `--text` (from `ink`), `--muted`, `--line`, `--line-strong`, `--font-mono` and `--font-display`.

2. CSS modules read them with `var(--…)`. `src/app/globals.css` defines only the motion tokens (`--ease-out`, `--ease-in`) and `color-scheme: dark`.
3. `layout.tsx` also exports `viewport.themeColor = THEME.bg` for the browser UI colour.

The teal tokens are not exposed as CSS properties, and neither is `FONTS.persian` (the `mono` and `display` stacks already fall back to Vazirmatn for Persian glyphs).

## How the tokens reach WebGL

Three.js modules import `THEME` and `FONTS` directly and turn the strings into `three` `Color` values or canvas fonts:

- `three/scene/createScene.ts`: scene background and `Fog` colour.
- `three/effects/AsciiFloor.ts`, `AsciiBlocks.ts` and `AsciiRain.ts`: glyph, edge and fog colours as shader uniforms.
- `three/world/GlyphKit.ts`, `Vignette.ts`, `createVignettes.ts` and the vignettes: scene materials and sign text.
- `three/cards/HolographicCard.ts` and `cardFace.ts`: the card slab and its baked canvas texture. Persian strings use `FONTS.persian`.
- `three/character/Character.ts`: brand accent materials.

The fog _colour_ comes from `THEME.bg`. The fog _distances_ are separate constants: `GLYPH_FOG` in `src/three/config.ts` for the glyph shaders, `createScene` for the scene fog and `AsciiRain` for the rain backdrop.

## Fonts

`FONTS.mono` (JetBrains Mono) and `FONTS.display` (Space Grotesk) both list Vazirmatn before their generic fallbacks. Persian characters missing from the Latin faces therefore render in Vazirmatn, one glyph at a time. The fonts are self-hosted through `@fontsource-variable/*` packages imported in the layout. Before building canvas textures, the Experience waits for the fonts to load (`Experience.loadFonts`).

## Adding or changing a token

1. Add or change the value in `THEME`.
2. If CSS needs it, add a mapping in `themeCssVariables()` and use `var(--name)` in the CSS module.
3. If WebGL needs it, import `THEME` in the Three.js module. Shader uniforms take the value once, when the material is created.

## Limitations

- **Literal colour values.** About 30 CSS declarations across the UI modules and `globals.css` write the cyan or line colour as literal `rgba(95, 240, 255, …)` values, with varying alpha, instead of using a token. Changing `THEME.cyan` does not update them. The same applies to the gradient stops in `Holo.module.css`.
- **Unused mappings.** `--cyan-soft` and `--deep` are mapped to CSS but no stylesheet reads them at present. Both tokens are used in WebGL.
- **Fixed after creation.** WebGL colours are set when materials are created, so changing a token at runtime would not update the world without rebuilding it.
