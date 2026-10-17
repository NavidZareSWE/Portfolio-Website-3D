# Architecture

This document describes how the portfolio is put together, as implemented in `src/`. The [README](README.md) covers running the project, the player-model tiers, the world's scenes and the measured load; this file focuses on how the parts connect.

## Overview

The site is one page per language. A Next.js server component prepares the translations. The browser then mounts a Three.js world (the walkable ASCII scene with five holographic cards) and a React interface on top of it (HUD, prompts, the section panel).

```
request ─► src/proxy.ts (locale routing)
        ─► app/[locale]/layout.tsx  (server: <html lang/dir>, metadata, theme CSS variables)
        ─► app/[locale]/page.tsx    (server: loads i18n resources, crawlable h1 and intro)
              └─ TranslationsProvider (client: i18next instance from the server's resources)
                   └─ ExperienceShell (client)
                        ├─ ExperienceClient  (dynamic import, ssr: false) ──► three/Experience
                        └─ Hud, InteractionPrompt, WASDGuide | TouchControls,
                           PortfolioOverlay, LoadingScreen
```

## Routing and locales

| File                          | Role                                                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18nConfig.ts`               | Locales `en` and `fa`; the default is `fa`. Exports `isLocale`.                                                                                                                                                                                                                   |
| `src/proxy.ts`                | Next.js 16 `proxy` (the former `middleware` convention), running `next-i18n-router`. `/` serves Persian, `/en` serves English, and the last choice is stored in the `NEXT_LOCALE` cookie. The matcher skips `api`, `static`, `_next` and any path containing a dot.               |
| `src/app/[locale]/layout.tsx` | `generateStaticParams` pre-renders both locales. An unknown locale calls `notFound()`. Sets `<html lang dir>` and the theme CSS variables, plus per-locale title, description, `alternates` and Open Graph data. `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` when it is set. |
| `src/app/[locale]/page.tsx`   | Server component. It calls `initTranslations(locale, NAMESPACES)` and renders a visually hidden `h1` and intro, a `<noscript>` message and the client shell.                                                                                                                      |

The production build pre-renders `/en` and `/fa` as static pages.

## Server and client boundary

- Server-only work: locale validation, metadata and loading the translation JSON (`src/i18n/initTranslations.ts` through `i18next-resources-to-backend`).
- The server passes the loaded resources to `TranslationsProvider` (`"use client"`). That provider creates one i18next instance per mount, initialised synchronously from those resources, so the client never fetches them again.
- `src/app/providers.tsx` creates one Redux store per mount (`useState(makeStore)`).
- `ExperienceShell` loads `ExperienceClient` with `next/dynamic` and `ssr: false`. Three.js and everything under `src/three/` therefore only ever run in the browser.
- Client code has no secrets. The only environment values it reads are `NEXT_PUBLIC_*` (see the README's environment table).

## State: Redux and the Experience event stream

Two channels connect the React interface and the 3D engine:

1. **Redux Toolkit** (`src/store/`) for low-frequency application state:
   - `game`: loading status, load step and progress, error, `paused`.
   - `interaction`: `nearbyCardId`, `isCharging`.
   - `portfolio`: `activeSection` (`sectionOpened` and `sectionClosed`).

   `selectAppMode` derives one explicit mode from these slices: `loading`, `playing`, `interacting`, `section-open`, `paused` or `error`. The shell writes it to the stage as `data-mode`.

2. **A typed event emitter** (`src/three/utils/EventEmitter.ts`) on the `Experience`. Its `ExperienceEvents` are `loadProgress`, `nearbyChange`, `chargeChange`, `chargeProgress`, `activate`, `pausedChange` and `modelDetail`.

   `ExperienceClient` forwards the low-frequency events into Redux. The continuous hold progress (`chargeProgress`) is never sent through Redux: `InteractionPrompt` writes it straight to a DOM transform through `ExperienceContext`.

The reverse direction is plain method calls on the `Experience`: `setActiveSection`, `setReducedMotion`, `setModelChoice` and the virtual-input setters used by the touch controls.

## The 3D engine (`src/three/`)

`Experience.ts` owns the renderer, the scene and a single `renderer.setAnimationLoop` loop.

**Initialisation** (`init()`, each step reported through `loadProgress`):

1. Create the renderer, with a quality profile from `quality/Quality.ts`.
2. Load fonts.
3. Fetch the logo SVG (optional: the world builds without it).
4. Choose the player-model tier, then load the tier model, the glyph-figure template and the mask textures in parallel.
5. Build the world.
6. Run the floor's field pass and `renderer.compileAsync`.
7. Render one frame, then report `ready`.

The `Experience` is disposable at any point. An aborted initialisation (React Strict Mode mounts effects twice in development) throws `ExperienceDisposedError`, and `ExperienceClient` ignores that error.

**Per frame** (`tick`):

- The frame time is clamped to 0.1 s and split into fixed sub-steps of at most 1/60 s (`simulate`).
- Each sub-step handles input, card proximity, Space (open a card or jump), the hold-to-open charge, the character controller (including sprint) and the animation state.
- `updateVisuals` and `renderFrame` then run once per frame.
- While a section is open on a constrained device, frames are throttled to `RENDER.readingFps`.
- The loop pauses while the tab is hidden.

| Folder         | Contents                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `camera/`      | Elevated three-quarter follow camera with a fixed direction. It frames the open section beside the overlay panel, using `config/layout.ts`.                                                                          |
| `input/`       | Keyboard and virtual touch input mapped to logical keys. Shift is the sprint modifier. Events aimed at form fields are ignored.                                                                                      |
| `physics/`     | Colliders as vertical prisms (walkable tops or solid), with step-up and a play-radius clamp.                                                                                                                         |
| `character/`   | The generated GLB character, controller, animation (rig in `characterRig.generated.ts`), and the logo and portrait textures.                                                                                         |
| `cards/`       | `CardRegistry` (layout and colliders) and `HolographicCard` (extruded slab, baked face texture from `cardFace.ts`).                                                                                                  |
| `interaction/` | Proximity with enter and exit radii, and hold-to-open charge.                                                                                                                                                        |
| `effects/`     | The glyph atlas, the glyph floor (two passes: a per-cell field render target, then the floor), the instanced data blocks and the digital-rain backdrop.                                                              |
| `scene/`       | Scene, fog and lights (`createScene`); floor, blocks, rain and logo (`createEnvironment`).                                                                                                                           |
| `world/`       | The scenes beside each card: glyph materials (`GlyphKit`), the fade (`Fade`), posable glyph figures, merged props and the five vignettes.                                                                            |
| `quality/`     | `Quality.ts`: GPU and software-render detection, `AdaptiveResolution` and `cappedDevicePixelRatio`. `ModelDetail.ts`: GPU and network classification and `decideTier`. `devOverrides.ts`: development-only switches. |
| `labels.ts`    | `SceneLabels`, the translated text drawn inside WebGL. React builds it and passes it in, so the engine has no i18n dependency.                                                                                       |
| `config.ts`    | Tunable constants: `WORLD`, `PLAYER`, `CAMERA`, `INTERACTION`, `CARD`, `GLYPH_FOG`, `SCENES` and `RENDER`.                                                                                                           |

### Rendering quality

- `detectQualityProfile` flags software rendering. It uses `failIfMajorPerformanceCaveat` and the unmasked renderer string.
- `AdaptiveResolution` then moves the render scale between `RENDER.minScale` and the capped device pixel ratio, based on the measured frame rate.
- While the device is constrained, `Experience.publishQuality` sets `<html data-quality="low">`, and the CSS drops backdrop blur in response (see [glassmorphic_UI_README.md](glassmorphic_UI_README.md)).

### Player model tiers

Five generated GLB tiers are listed in `character/modelTiers.generated.json`. In `init()` the starting tier is chosen in this order:

1. the development override;
2. the visitor's saved choice (`localStorage`, `components/experience/modelChoiceStorage.ts`);
3. `decideTier`, which looks at the GPU class, the network class and whether the device is touch-only.

`setModelChoice` swaps the model at runtime, and `ModelDetailMenu` in the HUD exposes that choice. The README's "Which player model loads" section has the decision table.

## Internationalisation

- Each namespace has one JSON file per language: `locales/<lng>/<ns>.json`. The namespaces are `ui`, `common`, `home`, `about`, `projects`, `skills`, `experience` and `contactus`.
- `npm run dev`, `build` and `start` each run `i18nexus pull` first, which needs `I18NEXUS_API_KEY`. Seven namespaces come from i18nexus and are not committed; edits to them are uploaded with `npm run i18n:push`. `ui` is committed in `locales/` instead, because adding it to i18nexus would exceed the plan's string limit, so the i18nexus project must not contain a `ui` namespace.
- During server rendering (and so during the build), `initTranslations` throws if any namespace file is missing or empty for either language. Such a file therefore fails the build instead of showing raw keys.
- React reads copy with `useTranslation`. Text inside the WebGL world (card faces, scene signs) is built into `SceneLabels` by `ExperienceClient`, and the world is rebuilt when the language changes.
- Direction comes from i18next (`i18n.dir`) and from `src/i18n/isTextDirectionRTL.ts`. Persian text in canvas textures uses the Vazirmatn font.
- HTML snippets from the locale files are sanitised with DOMPurify (`components/ui/RichText.tsx`). External links open in a new tab, and links to the hosts in `content/links.ts` `OFFLINE_HOSTS` are rendered without an `href`.

## Configuration modules

| Module                 | Holds                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/three/config.ts`  | Simulation, camera, interaction, card, glyph-fog, scene and render constants.                                                                                                       |
| `src/config/layout.ts` | Overlay panel width, the side-panel breakpoint, the bottom-sheet fraction and cap, and `STAGE_ID`. These are shared by the camera framing and the CSS.                              |
| `src/theme/theme.ts`   | Colour and font tokens shared by CSS and WebGL (see [THEME_SYSTEM_README.md](THEME_SYSTEM_README.md)).                                                                              |
| `src/content/`         | Structure only: section metadata and card ASCII art (`sections.ts`), contact links and offline hosts (`links.ts`), and skill lists and icons (`skills.ts`). No visitor-facing copy. |

## Contact form

`SectionContent.tsx` posts the form to Web3Forms when `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` is set. Without it, the Send button opens the visitor's email app with a prefilled message (`mailto:`). Either way the fields stay editable.

## Build-time and offline tooling

These are not part of the runtime bundle:

| Path                    | Purpose                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/dev.mjs`       | Wraps `next dev`. Maps `--lod`, `--gpu` and `--net` to the `NEXT_PUBLIC_DEV_*` variables.                                                   |
| `scripts/i18n-push.mjs` | Uploads changed `locales/` namespaces to i18nexus (`npm run i18n:push`) and checks the result. Skips `ui`, which is committed.              |
| `scripts/character/`    | Python procedural generator for the character GLBs, the glyph-figure GLB, the rig module and the tier manifest.                             |
| `scripts/mask/`         | Python script that turns the mask reference image into the two mask textures.                                                               |
| `tools/fast-glob-shim/` | Local replacement for `fast-glob` (backed by `tinyglobby`), wired through `package.json` `overrides` (see the README's "Dependency audit"). |

## Known limitations

- There is no automated test suite. Verification is lint, type checking and the production build.
- WebGL is required. Without it the shell shows an error fallback, and the server-rendered `h1`, intro and `<noscript>` text remain for crawlers.
- There is a single dark theme with no theme switching.
- Many CSS rules repeat the theme's cyan as literal `rgba(95, 240, 255, …)` values instead of reading a token. Changing `THEME.cyan` alone does not update those (see [THEME_SYSTEM_README.md](THEME_SYSTEM_README.md)).
