/**
 * Single source of truth for the visual language shared by the 3D world
 * (shaders, canvas textures, materials) and the React interface (exposed
 * as CSS custom properties on <html> by the root layout).
 *
 * The motif everywhere is a "holo-terminal": deep navy glass, a thin cyan
 * rule with corner brackets, mono `// 0X` headers, glyph dividers and a
 * scanline texture.
 */
export const THEME = {
  /** Void behind everything. */
  bg: "#04060b",
  /** Glass panel fill (cards, overlay, HUD chips). */
  panel: "rgba(6, 18, 40, 0.84)",
  panelSolid: "#071226",
  /** Primary signal colour: borders, glyphs, active states. */
  cyan: "#5ff0ff",
  /** Softer cyan for large luminous surfaces (logo, card title glow). */
  cyanSoft: "#8af0ff",
  /** Secondary accent: beams, dashed frames, dim glyphs. */
  blue: "#2a8cff",
  /** Brand accent (logo, piping, sneaker glow). */
  green: "#3dff7a",
  /** Environment glyphs (card-2 reference): dark teal family. */
  teal: "#3fe0cf",
  tealMid: "#1b8f88",
  tealDeep: "#0a2f2f",
  /** Deep glyph colour for low-intensity ASCII. */
  deep: "#0d2a4a",
  /** Text. */
  ink: "#dbf4ff",
  muted: "#7d9cba",
  /** Hairline rule. */
  line: "rgba(95, 240, 255, 0.28)",
  lineStrong: "rgba(95, 240, 255, 0.85)",
} as const;

/*
 * Vazirmatn follows the Latin faces in every stack: Persian characters are
 * missing from JetBrains Mono / Space Grotesk, so the browser falls back to
 * it glyph by glyph while Latin text keeps the terminal look.
 */
export const FONTS = {
  mono: '"JetBrains Mono Variable", "JetBrains Mono", "Vazirmatn Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
  display:
    '"Space Grotesk Variable", "Space Grotesk", "Vazirmatn Variable", ui-sans-serif, system-ui, sans-serif',
  persian: '"Vazirmatn Variable", "Vazirmatn", Tahoma, sans-serif',
} as const;

/** Maps theme tokens to the CSS custom properties used by the CSS modules. */
export function themeCssVariables(): Record<string, string> {
  return {
    "--bg": THEME.bg,
    "--panel": THEME.panel,
    "--panel-solid": THEME.panelSolid,
    "--cyan": THEME.cyan,
    "--cyan-soft": THEME.cyanSoft,
    "--blue": THEME.blue,
    "--green": THEME.green,
    "--deep": THEME.deep,
    "--text": THEME.ink,
    "--muted": THEME.muted,
    "--line": THEME.line,
    "--line-strong": THEME.lineStrong,
    "--font-mono": FONTS.mono,
    "--font-display": FONTS.display,
  };
}
