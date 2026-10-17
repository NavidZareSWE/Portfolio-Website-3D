# NZSWE — Interactive 3D Portfolio

![NZSWE — Interactive 3D Portfolio](https://res.cloudinary.com/dyjew8iji/image/upload/v1792251604/nzswe-banner-3000x1000_2x_s1akab.png)

An explorable ASCII-cyberpunk world. A hooded hacker walks between holographic cards. Holding **Space** next to a card opens that portfolio section.

**Inspiration:** this project was inspired by [Bruno Simon's](https://bruno-simon.com/) 3D portfolio.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, native Three.js, Redux Toolkit and i18next (Persian and English).

**Further documentation:**

- [ARCHITECTURE.md](ARCHITECTURE.md): how the app is put together (routing, state, the 3D engine, rendering quality, i18n).
- [THEME_SYSTEM_README.md](THEME_SYSTEM_README.md): the shared colour and font tokens used by both CSS and WebGL.
- [glassmorphic_UI_README.md](glassmorphic_UI_README.md): the translucent "holo" panels and buttons, and their low-quality fallback.

## Prerequisites

- **Node.js 20.9 or newer.** This is the `engines` requirement of the installed `next@16.4.2`. npm is the package manager (`package-lock.json`).
- **Python 3** only to regenerate the 3D models. `scripts/character/requirements.txt` lists the character generator's packages. `scripts/mask/make_mask_textures.py` imports NumPy and Pillow, which that file does not list.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 (wraps `next dev`, see below)
npm run build && npm start
```

## Verification

| Command            | What it checks                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm run lint`     | ESLint (`eslint-config-next` core-web-vitals and TypeScript rules)                                            |
| `npx tsc --noEmit` | Type checking with the project's TypeScript (there is no npm script for it; `npm run build` also type-checks) |
| `npm run build`    | Production build and static generation of `/en` and `/fa`                                                     |
| `npm audit`        | Dependency advisories (see "Dependency audit")                                                                |

The repository has no automated unit, integration or end-to-end test suite.

## Environment variables

Only `I18NEXUS_API_KEY` is required (the scripts download the translations). The others are optional:

| Variable                                                            | Read by                                                          | Effect                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                              | `src/app/[locale]/layout.tsx`                                    | Sets `metadataBase` for absolute metadata URLs. Unset: no `metadataBase`.                                                    |
| `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`                                  | `src/components/ui/SectionContent.tsx`                           | Contact form posts to Web3Forms. Unset: Send opens the visitor's email app instead.                                          |
| `I18NEXUS_API_KEY`                                                  | `i18nexus-cli` (`npm run dev`, `build`, `start` and `i18n:pull`) | **Required.** Downloads the i18nexus namespaces into `locales/` (only `ui` is committed). Not part of the client bundle.     |
| `NEXT_PUBLIC_DEV_LOD`, `NEXT_PUBLIC_DEV_GPU`, `NEXT_PUBLIC_DEV_NET` | `src/three/quality/devOverrides.ts`                              | Development-only overrides, set by `scripts/dev.mjs` from `--lod/--gpu/--net`. Ignored when `NODE_ENV` is not `development`. |

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so they must never hold secrets.

### Testing the player models from the terminal (development only)

`npm run dev` accepts switches that test the five player models and the device detection. They work the same in cmd, PowerShell and bash, and production builds ignore them:

```bash
npm run dev -- --lod high          # force a tier: very-low | low | medium | high | super
npm run dev -- --gpu software      # simulate a GPU class: software | low | mid | high | unknown
npm run dev -- --net slow          # simulate a connection: slow | limited | good | unknown
npm run dev -- --gpu high --net limited --port 3001   # combine; other flags go to `next dev`
npm run dev -- --help
```

In development the browser console prints which model was loaded, why, and what "auto" would pick (e.g. `player model: low (auto); auto would pick low: gpu=high -> high; network=limited (cap low)`).

## Controls

| Input                  | Action                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| W A S D / arrows       | Move (screen-relative, diagonals normalised)                                                                  |
| Shift (held)           | Sprint: 1.6× speed, same animation (`PLAYER.sprintMultiplier`); shown on the guide's bottom row next to Space |
| DETAIL button          | Player model detail: Auto or one of five tiers (saved in this browser)                                        |
| Space                  | Jump (when no card is nearby)                                                                                 |
| Hold Space near a card | Open that section (never jumps)                                                                               |
| Esc / close button     | Return to the world (same position)                                                                           |
| Index button           | Open any section directly (keyboard and screen-reader friendly)                                               |

Touch-only devices get a virtual stick and an action button.

## Where things live

```text
src/
  app/[locale]/           root layout (lang/dir, metadata per language) and page (server component)
  proxy.ts                next-i18n-router: locale detection, cookie, `/` = fa, `/en` = en
  i18n/                   initTranslations (server), TranslationsProvider (client), RTL helper
  components/
    experience/           client-only boundary (dynamic import, ssr:false), canvas host, error boundary
    ui/                   HUD, index menu, prompt, section panel, loading screen
    ui/holo/              HoloFrame / GlyphRule / HoloTrack: the shared card-frame primitives
    controls/             WASD guide (wobble.ts = port of the supplied wobble effect), touch controls
  content/                section ids, card codes and ASCII art; contact links; skill lists (no copy)
  config/layout.ts        overlay panel sizes shared by CSS and the camera; the stage element id
  hooks/                  media-query hooks; close-on-outside-click/Escape hook for the HUD menus
  store/                  Redux Toolkit: game, interaction, portfolio slices + selectors
  theme/theme.ts          single palette and fonts, used by CSS and by the WebGL scene
  three/                  Experience (single loop), camera, input, physics, character,
                          cards, ASCII effects (glyph floor, glyph blocks, digital rain)
  three/quality/          render quality (adaptive resolution) and player-model tier choice
  three/world/            the scenes beside each card: glyph materials (GlyphKit), posable
                          glyph figures (GlyphFigure + poses), merged props (PropKit), vignettes/
locales/{en,fa}/*.json   ALL copy, one file per i18next namespace
scripts/dev.mjs           `npm run dev` wrapper (development-only --lod/--gpu/--net switches)
scripts/i18n-push.mjs     `npm run i18n:push`: uploads edited locales/ JSON to i18nexus (skips ui)
scripts/character/        procedural sculpt of the character (SDF to mesh to GLB)
scripts/mask/             turns the Anonymous mask reference image into the two mask textures
tools/fast-glob-shim/     dependency override for the linter (see "Dependency audit")
public/models/hacker.glb        generated player model
public/models/hacker-glyph.glb  low-detail copy for the glyph figures (same pivots)
public/models/hacker-{very-low,low,high,super}.glb  the other player detail tiers (hacker.glb is medium)
public/textures/anonymous-mask-{white,dark}.png  two-tone mask sources (scripts/mask/), drawn as glyphs at runtime
```

### Languages and content

The site is bilingual (Persian and English) and uses the same i18next setup as the main portfolio site:

- `i18nConfig.ts` lists the locales. Persian is the default, served at `/`; English is served at `/en`. The visitor's choice is stored in the `NEXT_LOCALE` cookie by next-i18n-router.
- `src/i18n/initTranslations.ts` loads the namespaces on the server. `TranslationsProvider` hands them to client components, which call `useTranslation`.
- `html` gets `lang` and `dir`, and the panels use CSS logical properties, so Persian renders right-to-left. The WASD guide, touch controls and terminal-style chrome stay left-to-right on purpose.
- The 3D world gets its text (card faces, the "calling" and construction signs) as a `SceneLabels` object built in `ExperienceClient`. Card faces are baked textures, so switching language reloads the world.

Namespaces in `locales/{en,fa}/`:

| Namespace                                           | Content                                                                        | Where it comes from              |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| `common`, `home`, `projects`, `skills`, `contactus` | Shared with the main site                                                      | i18nexus (`i18nexus pull`)       |
| `about`                                             | The About copy from the main site                                              | i18nexus (`i18nexus pull`)       |
| `experience`                                        | Work history and education from the résumés                                    | i18nexus (`i18nexus pull`)       |
| `ui`                                                | Text for this site only: HUD, prompts, loading screen, card faces, world signs | **Committed** in this repository |

**Where the translation files come from.** `npm run dev`, `npm run build` and `npm start` each run `i18nexus pull` first. The pull downloads every namespace of the i18nexus project into `locales/<lng>/<ns>.json`. `npm run i18n:pull` runs the pull on its own.

- **`ui` is committed, everything else comes from i18nexus.** `.gitignore` ignores the JSON files in `locales/` except `ui.json`. Adding `ui` (119 strings per language) to i18nexus would put the project over its plan's string limit (the import is refused with HTTP 403), so `ui` lives in the repository instead.
- **The i18nexus project must not have a `ui` namespace**, not even an empty one. The pull writes every namespace it gets, so an empty `ui` in i18nexus would overwrite the committed `ui.json` with `{}` and the site would show raw keys such as `hud.index`.
- **Changing text in the other namespaces:** edit the JSON, then run `npm run i18n:push` (`scripts/i18n-push.mjs`) **before** `dev`, `build` or `start`, because their pull overwrites unpushed edits. `--dry-run` lists the differences without sending anything. The script skips `ui` (`LOCAL_ONLY_NAMESPACES`) and needs `I18NEXUS_PERSONAL_ACCESS_TOKEN` (import strings, create namespaces) in `.env`; Vercel does not need it.
- **Changing text in `ui`:** edit `locales/<lng>/ui.json` and commit it.
- `I18NEXUS_API_KEY` must be set wherever these scripts run: in `.env` locally, and in the hosting provider's environment variables (Vercel: Production and Preview). Without it the pull stops with "required option '-k, --api-key <apiKey>' not specified", and the build fails.
- **Build check.** `src/i18n/initTranslations.ts` checks that all eight namespaces exist and are not empty, for both languages. Otherwise the build fails and lists the files, for example `Missing or empty translation files: locales/en/ui.json`, instead of deploying raw keys. To reproduce a fresh clone (as on Vercel), move `locales/` aside, restore `ui.json` with `git checkout -- locales`, and run `npm run build`.
- Pages are pre-rendered at build time, so the pull in `npm start` does not change what is served. It only refreshes `locales/` on disk.

The contact form posts to Web3Forms, like the main site. Set `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`. Without it the form still works: Send opens the visitor's email app with the message, name and address filled in, addressed to the contact email.

The ARPut sites are never linked, because they are no longer online. In Experience the domains appear as plain text. In Projects, entries whose site is offline carry an "offline" note instead of a live link.

Opening a section always starts at the top of the panel. The Space that opened it is usually still held, and its key-repeat would page-scroll the focused panel to the end, so those repeats are ignored until Space is released (`PortfolioOverlay.tsx`).

### Regenerating the character

The hooded hacker is sculpted as signed-distance fields in `scripts/character/model.py`. It covers the peaked hood draping into the shoulders, the recessed void face, the zip hoodie with drawstrings, ribbing and folds, the joggers, the chunky sneakers and the backpack.

The generator meshes each part on its own animation pivot, bakes ambient occlusion into the vertex colours, and writes:

- the GLB model;
- `src/three/character/characterRig.generated.ts` (pivots, plus the logo anchors: chest, backpack, both sleeves; medium run only);
- `src/three/character/modelTiers.generated.json` (triangles and file size per tier, used by the detail menu and the automatic choice).

Triangle budgets are set per part (`PART_SCALE` in the generator); the hood and shoes keep more detail than the fabric surfaces. There are five detail tiers with the same parts and pivots, so any of them drives the same rig and can be swapped at runtime:

| Tier     | File                  | Triangles | Size (raw / gzip) | Build settings                             |
| -------- | --------------------- | --------- | ----------------- | ------------------------------------------ |
| very-low | `hacker-very-low.glb` | 24.6k     | 0.66 / 0.31 MB    | 14% of medium (sneakers 50%)               |
| low      | `hacker-low.glb`      | 39.4k     | 1.05 / 0.53 MB    | 30% of medium (sneakers full)              |
| medium   | `hacker.glb`          | 64.3k     | 1.69 / 0.93 MB    | the original model                         |
| high     | `hacker-high.glb`     | 130k      | 3.40 / 1.99 MB    | 1.5× the authored budget, 0.85× voxel size |
| super    | `hacker-super.glb`    | 294k      | 7.66 / 4.42 MB    | 3.5× the authored budget, 0.65× voxel size |

```bash
pip install -r scripts/character/requirements.txt
python3 scripts/character/generate_character.py                 # medium model + rig, about 1–2 minutes
python3 scripts/character/generate_character.py --lod very-low  # or low | high | super (super takes about 6 minutes)
python3 scripts/character/generate_character.py --glyph         # low-detail copy for the glyph figures
```

### Which player model loads

On load the site decides the tier in this order:

1. A tier forced with `npm run dev -- --lod <tier>` (development only).
2. The visitor's choice from the DETAIL menu, saved in this browser (`localStorage`, key `nzswe:model-detail`). Switching downloads the new model and swaps it in place; position, pose and motion carry over.
3. Auto (`three/quality/ModelDetail.ts`), which combines:
   - **GPU class**, from the WebGL renderer string plus the software-rendering check. Software → very-low, older integrated or mobile → low, modern integrated (Iris Xe, Radeon APUs, Apple M1–M4, recent Adreno/Mali) → medium, discrete or high-end → high. This is a heuristic: browsers can mask or simplify the string, and then the class is "unknown".
   - **Connection class**, from the Network Information API (`navigator.connection`: Chromium browsers only). Elsewhere, the download of the glyph-figure model, which loads first anyway, is timed with Resource Timing (cached or very small downloads say nothing, so they count as unknown). Slow → at most very-low; limited → at most low; good → up to high.
   - **When unknown, conservative.** An unknown GPU gives medium on desktop and low on touch devices; an unknown connection caps auto at medium. Auto never picks super; only the menu or `--lod` does.

The connection only decides how much is downloaded, which affects loading time; once the model is loaded, frame rate depends on the GPU and the render scale.

The NZSWE emblem is extruded at runtime from `public/logo/nzswe-logo.svg`, the supplied logo, unmodified.

## The world around the cards

Every scene is drawn in the same glyph language as the floor and blocks: surfaces are grids of characters from the shared atlas, shaded by a fixed key light, with a cyan silhouette line on figures and the brand green reserved for the "story" objects (phone, guitar sound hole, screens, roof blocks). Figures are glyph copies of the hacker, posed by joint targets (`world/poses.ts`).

| Card       | Scene beside it                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects   | Construction site. The hacker operates a tower crane from its cab, swinging blocks from the stock pile onto the roof of a building under construction; the floor resets when complete.      |
| Skills     | Two-monitor desk. He types in bursts while green code rains down both screens.                                                                                                              |
| Contact    | On a couch, legs crossed, corded phone at the hood, head tilted, foot tapping; "CALLING…" pulses and rings leave the phone.                                                                 |
| About      | Guitar on an amp (notes float up), freestyle laps in a pool, and drawing the N logo on an easel canvas (wiped and redrawn).                                                                 |
| Experience | Three hackers in Anonymous masks type at a table; one seat is empty. When you first come close, the hacker walks in, sits, puts on the mask and starts typing. Walk far away and it resets. |

Figures and their furniture are 1.5x the player (`SCENES.npcScale` in `three/config.ts`) and stay smaller than the cards. Characters and the furniture around them have no collider: you can walk through them. When the crane finishes the roof, the six blocks dissolve with the same glyph fade before construction starts over; they stay solid underfoot until fully faded.

Each element (every hacker with their chair, the table, desk, couch, side table, lamp, amp, cabinet, easel, stool, traffic cones, barriers, wheelbarrow) fades out on its own when you walk into it, so only your character is visible, and fades back in once you have fully left it (0.3 m of hysteresis). The fade is a dissolve in the glyph grid: characters drop out cell by cell in random order while the rest dim (0.35 s out, 0.55 s in). Moving figures (the painter, the arriving hacker) fade the same way while you stand in them. See `world/Fade.ts`: each element gets its own copies of the shared materials, compiled to the same shader programs, so fading costs no extra compiles or draw calls.

The construction site has physics: the pallet, crates and two scaffold decks form a route you can jump up (every rise is below the jump height) to the roof of the building. The crane's concrete base, the stock pile and the I-beam stack can be stood on too, and the roof blocks become solid as the crane places them. The building walls, the crane mast, the mixer, the sign, the pool and the server rack are solid.

The Anonymous masks are glyph art built from the reference image: `scripts/mask/make_mask_textures.py` turns it into a white and a dark two-tone texture, and the shader draws one character per cell from it. The table uses the white one; `MASK_VARIANT` in `vignettes/AnonCouncil.ts` switches to the dark one.

Scenes live in `src/three/world/vignettes/`; their placement relative to each card is `SCENE_OFFSET` in `world/createVignettes.ts`. Each registers its own colliders.

## Architecture notes

- **One animation loop.** `Experience.ts` owns it via `renderer.setAnimationLoop`. Simulation is sub-stepped at ≤ 1/60 s with delta time, so movement is frame-rate independent.
- **No per-frame data in React or Redux.** Redux only receives discrete changes: load steps, nearby card, hold started or cancelled, section opened or closed. The hold progress and the WASD key states are written straight to the DOM through subscriptions.
- **Opening a section keeps it open.** Focus moves to the dialog itself, not to its Esc button: the section opens while Space is still held, and a focused button would activate on the Space key-up and close it again.
- **Space priority is deterministic.** Near a card, Space always means "hold to open". Elsewhere it means "jump". Keys held while opening or closing a section are suppressed until physically released, so a held Space can never turn into a jump. Key-repeat never re-triggers.
- **Proximity uses hysteresis.** It enters at 2.7 m and exits at 3.2 m, so the prompt never flickers at the boundary.
- **Explicit app mode.** `selectAppMode` derives one of `loading`, `playing`, `interacting` (next to a card), `section-open`, `paused` (tab hidden, loop stopped) or `error`. It is exposed as `data-mode` on the stage element.
- **WASD guide.** The key outlines use the exact spring/bite animation of the supplied `Jagged wobbly effect.html` (same points, springs, timings and random schedule; hard shadow is the same path offset by 5,5). Only colours and the pixel font placement are adapted to the world. Bites pause while the tab is hidden and are disabled under `prefers-reduced-motion`.
- **Strict-Mode safe.** The first mount is fully disposed: loop stopped, listeners removed, GPU resources freed, async initialisation aborted.

## Dependency audit

`npm audit` reports 0 vulnerabilities. The only advisory found was GHSA-vfj7-8cjw-p6xm (`braces` ≤ 3.0.3, stack exhaustion on deeply nested patterns). It has no patched release. It reached this project only through the linter: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. Nothing in the site's runtime bundle uses it.

`npm audit fix --force` would downgrade `eslint-config-next` to 14.x, which does not work with Next 16. Instead, `package.json` overrides `fast-glob` with `tools/fast-glob-shim`, a small module backed by `tinyglobby`, which has no `braces`/`micromatch` dependency. The ESLint plugin makes one call, `globSync(pattern, { onlyDirectories: true })`, for its `rootDir` setting, and the shim returns the same results as fast-glob for it (no expansion into subdirectories, no trailing slashes). If a future `@next/eslint-plugin-next` drops fast-glob, or `braces` publishes a fix, remove the override and the shim.

## Performance on machines without a GPU

The world is fill-bound: the simulation takes under a millisecond per frame, and nearly all of the frame is spent shading pixels. Without a GPU the browser rasterises WebGL on the CPU (SwiftShader, llvmpipe, WARP), where every pixel and triangle counts. What the site does about it:

- **Adaptive resolution** (`three/quality/Quality.ts`). Once a second the average frame time is checked. Below 48 fps the render scale drops (two steps if below about 29 fps); above 57 fps it rises one step after 4 s, and an increase that has to be undone blocks the next one for twice as long. It ranges from 0.5 up to the device pixel ratio (at most 2).
- **Device profile.** Software rendering is detected (`failIfMajorPerformanceCaveat`, then the renderer string). It starts at a 0.75 render scale with a ceiling of 1, without MSAA, with 2× instead of 8× anisotropic filtering (the same look from this camera, half the floor's sampling cost), and the automatic player model is very-low (see "Which player model loads"). GPUs start at 1.5 and keep MSAA and 8× filtering.
- **Floor in two passes** (`effects/AsciiFloor.ts`). Everything except a glyph's shape is constant across a floor cell, and a cell covers hundreds of pixels. The cell field is evaluated once per visible cell into a small texture, and the floor shader only looks it up. Output matches the single-pass shader to within 3/255 (checked pixel by pixel).
- **Overdraw.** The floor draws after the other opaque objects and the rain backdrop draws last, so covered pixels are rejected by the depth test before their shaders run.
- **Triangles.** The glyph figures use a 6.8k-triangle model (it was 11k) and the logo emblems use 4 segments per curve; neither changed visibly at play distance.
- **UI.** While the device is constrained, `<html data-quality="low">` removes the backdrop blur from panels, since re-blurring a live canvas every frame is expensive on the CPU. With a section open, the world behind it renders at 30 fps so scrolling stays smooth.

In the CPU-only test browser here, at 1440×900, one frame at spawn went from about 640 ms to about 180 ms. The Experience table went from about 810 ms to 220 ms, before the adaptive scale goes any lower. These are relative numbers from a slow software rasteriser, not frame rates you will see on real hardware.

## Measured load (production build, this machine)

| Item                                                                                    | Size                                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| JavaScript (all chunks, gzip)                                                           | about 400 KB, of which about 205 KB is Three.js                                                                          |
| Player model `hacker.glb`                                                               | 1.65 MB raw, about 0.92 MB gzip                                                                                          |
| Other player tiers                                                                      | see the tier table under "Regenerating the character"; only one tier is downloaded per visit unless the visitor switches |
| Glyph-figure model `hacker-glyph.glb`                                                   | 0.20 MB raw, about 0.10 MB gzip (6.8k triangles)                                                                         |
| Per frame, start view (1280×800)                                                        | 55 draw calls (including the floor's field pass), about 87k triangles                                                    |
| Per frame, busiest view measured (Experience table with the About scenes also in frame) | 288 draw calls, about 214k triangles                                                                                     |

Frame rate was **not** measured on real hardware: the test browser here renders on a software GPU, so its numbers say nothing about real devices.

## Potentially unused code (kept for now)

The maintenance pass on 2026-10-17 found the items below. They have no references in this repository: the search covered TypeScript references across `src/`, plus text searches of `src/`, `locales/`, `public/`, `scripts/` and `tools/`. **All of them are intentionally kept for now.** Code can still be used in ways a search cannot see (external links, keys built at runtime, future features), so review each item before removing it.

**Symbols with no references:**

| Location                      | Symbol                                      |
| ----------------------------- | ------------------------------------------- |
| `src/store/selectors.ts`      | `selectNearbyCard`                          |
| `src/three/world/Vignette.ts` | `themeColor`                                |
| `src/three/world/poses.ts`    | `SEAT_HEIGHT`, `DESK_HEIGHT`, `STAND_REACH` |
| `src/types/index.ts`          | `isSectionId`                               |

**Exported, but only used inside their own file.** The code is active; only the `export` keyword is unused.

- `i18nConfig.ts`: `Locale`
- `src/components/controls/wobble.ts`: `WOBBLE`
- `src/hooks/useMediaQuery.ts`: `useMediaQuery`
- `src/store/`: `AppMode`, `GameState`, `InteractionState`, `PortfolioState`
- `src/three/`:
  - `Experience.ts`: `ExperienceEvents`, `ExperienceOptions`
  - `cards/CardRegistry.ts`: `CardFaceAssets`
  - `cards/HolographicCard.ts`: `SharedCardResources`
  - `cards/cardFace.ts`: `CARD_FACE_W`, `CARD_FACE_H`, `CardFaceResult`
  - `character/`: `AnimationInput`, `ControllerFrameEvents`, `LOGO_URL`
  - `effects/`: `ATLAS_GRID`, `MAX_FLOOR_CARDS`
  - `input/InputManager.ts`: `InputEvents`
  - `interaction/InteractionSystem.ts`: `InteractionCallbacks`
  - `quality/`: `MODEL_TIERS`, `DetailDecision`, `detectGpu`, `QualityProfile`
  - `world/`: `GLYPH_MODEL_URL`, `REST_POSE`, `SolidOptions`, `ImageOptions`, `FACE_CAMERA_PITCH`, `MASK_URLS`, `SIT_LIFT`
- `src/types/index.ts`: `SECTION_IDS`

**Files and content:**

- **Icons:** `public/icons/envelope-at-fill.svg`, `envelope-at.svg`, `github.svg`, `linkedin.svg`, `location.svg` and `telegram.svg` are not referenced by the code or the locale files.
- **Locale keys in `ui`:** `hud.language`, `touch.stick`, `about.downloadCv`, `contact.channels`, `contact.location`, `contact.openMap`, `language.en` and `language.fa`.
- **Locale keys in shared namespaces:** `common` has `country`, `lastName`, `navbar.back` and `pronoun`; `contactus` has `contactus.contactUs`. These two namespaces are shared with the main site's i18nexus project, so `npm run i18n:pull` would bring the keys back.
- **CSS variables:** `--cyan-soft` and `--deep` are set by `themeCssVariables()`, but no stylesheet reads them. Their theme tokens are used in WebGL.

**Overlapping helpers, kept separate on purpose** (they behave differently):

- Touch detection: `useIsTouchOnly` (`hooks/useMediaQuery.ts`) and `isTouchDevice` (`three/quality/ModelDetail.ts`).
- Persian-script and direction checks: `PERSIAN_SCRIPT` (`Vignette.ts`), `SCRIPT_RUN` (`WASDGuide.tsx`) and `isTextDirectionRTL` (`i18n/`).
