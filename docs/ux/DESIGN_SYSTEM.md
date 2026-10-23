# Scorebook — Design System

Spec: §1, §67–§78, §101, **§106 (liquid glass amendment)**, **§107 (Cyber-Cyan / Deep Electric Teal palette)**. Implemented by **WP-design-system** in `src/ui/**` (tokens in `src/ui/theme`, glass material in `src/ui/glass`, text styles in `src/ui/typography`, primitives in `src/ui/primitives`, scoreboard parts in `src/ui/scoreboard`, charts in `src/ui/charts`). Companion docs: [THEMES.md](THEMES.md) (per-component colour mapping, charts, PDF), [RESPONSIVE.md](RESPONSIVE.md), [ACCESSIBILITY.md](ACCESSIBILITY.md), [WIREFRAMES.md](WIREFRAMES.md).

Every value in this document is a contract for `src/ui`. Feature code never uses a hex literal, a raw number for spacing, or a font name. It uses `theme.color.*`, `theme.space.*`, `theme.radius.*` and `<Text variant="…">`.

---

## 0. Identity: a modern cricket scorebook

The product should look like a well-kept scorebook set in a sports-broadcast typeface, lit like a **night stadium scoring HUD** (§107): obsidian and ice grounds, cyan and deep teal for identity and interaction. It is information design, not decoration (§1, §101), and never a gaming dashboard. Since §106 the **floating control and navigation layer** is made of liquid glass: the scorebook page stays calm and solid, and the chrome that floats above it (tab bar, top bars, sheets, dialogs, toasts, menus, segmented and filter bars, the scoring dock, floating buttons, the live score band) is a translucent, frosted material that lets the page show through (§1.4).

| Do | Don't (§1) |
|---|---|
| Hierarchy comes from type size and weight. Numbers are the heroes. | Card per statistic, "dashboard tiles", KPI boxes |
| Full-bleed rows separated by hairlines, as on a scorebook page | Rounded cards floating on a grey canvas |
| Sections separated by the **boundary rule**: a 2 px rule, 2 px gap, 1 px rule, like the heavy ruling between innings in a printed scorebook | Gradients, glass, glow, neon, drop shadows **on content** (tables, lists, forms, rows) |
| Liquid glass on the floating chrome only, built from `src/ui/glass` (§1.4, §106) | Glass on content, glass behind dense numbers, raw `GlassView`/`BlurView`/gradients in feature code |
| Condensed numerals (Barlow Condensed) for the score, overs and figures, as on a ground scoreboard | Giant icons, illustrations, stadium photos, grass, bats or balls |
| Restrained marks for events: circle, outline, fill, square. Each is paired with its text label | Colour-only states, confetti, game-show animation |
| One identity family (§107 cyan / deep teal): `accent` for interaction, `accentDeep` for secondary fills, `highlight` only for attention | Multi-colour palettes, accent on every element, neon, glowing blobs, RGB-gaming glow, ultra-bright cyan on routine 4s/6s |

Cricket details are allowed only when they carry information:
- **Score notation**: `142/4`, overs `16.4`, figures `3.4-0-28-2`.
- **Over indicator**: the current-over strip shows one empty placeholder circle for each legal ball still due in the over.
- **Scorebook grid**: the ball-by-ball log lays each over out as a row of ball cells, like the bowling-analysis boxes in a paper book.
- **Boundary rule** between major sections.
- **Stumps glyph** on the WICKET key: three vertical strokes plus a bail, drawn in `react-native-svg` at 20 px. It is the only custom icon.

---

## 1. Colour tokens (§71, §107)

The §71 tokens are mandatory. The extended tokens complete the system and use the same naming rules. Since **§107 (2026-10-02)** the palette is **Cyber-Cyan / Deep Electric Teal**: a night stadium, a professional scoring HUD and liquid glass, not a gaming dashboard. Cyan/teal is the identity; green survives only as the small `success` signal (the second chart series is a muted violet). §107 supersedes the warm off-white + cricket green of §68 and the green-charcoal dark of §69. Light and dark were designed separately (THEMES.md §2), and dark is not an inversion of light.

### 1.1 Core tokens (§71)

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F0F5F8` cool ice | `#070E12` obsidian (plus the §1.4 ambient glows) | Screen canvas |
| `surface` | `#FFFFFF` | `#0D171C` (one step above the page) | Rows, tables, inputs, scoring keys, the selected segment lens |
| `surfaceElevated` | `#FFFFFF` (plus elevation 1) | `#132129` (tone step, no shadow) | Solid raised content such as chart callouts. Sheets, dialogs, menus and toasts are glass (§1.4) |
| `textPrimary` | `#0B232B` deep teal ink | `#F2F7F9` | Body text, names, table values |
| `textSecondary` | `#3D5864` mid teal-grey | `#8FA7B3` | Supporting lines, column headers, unselected tabs |
| `textMuted` | `#526B77` | `#7F97A3` | Metadata (dates, "16.4 ov" suffix), dot balls, placeholders |
| `border` | `#D5E0E6` | `#1A2A33` cool blue-grey | Hairline separators (decorative, not an affordance) |
| `accent` | `#00606F` deep teal (AA as text: 7.23:1 on white) | `#00C2E0` cyan | Primary buttons, selection, links, striker marker, the FOUR chip |
| `success` | `#0C7552` | `#35D49A` | "Qualified", completed/saved confirmations |
| `warning` | `#8A5000` | `#FFB74D` | Advisory banners (retirement due, uneven pools, provisional), "Manual Override" |
| `danger` | `#C42B2B` | `#FF5252` wicket red | Wicket, destructive actions, errors |
| `score` | `#061A20` | `#F8FCFD` near-white | The live score figure and score keys only (the highest-contrast ink) |

### 1.2 Extended tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `surfaceSunken` | `#E2EBF0` | `#04090C` | Scoring pad well outside the glass dock (edit ball), skeleton blocks, pressed rows |
| `borderStrong` | `#6E848E` | `#5A7482` | Input outlines, secondary buttons, ball-chip outlines (affordances, so ≥ 3:1) |
| `accentPressed` | `#004A56` | `#00A5BF` | Pressed primary button |
| `accentDeep` | `#007385` | `#008BA3` deep teal | **Secondary / selection fills** (§107 "secondary"): the SIX chip fill. Carries `onAccent` ink at ≥ 4.5:1 |
| `accentSubtle` | `#DCEFF3` | `#0A2C36` | Selected row/segment tint, current batter row, pressed run key |
| `onAccent` | `#FFFFFF` | `#010B0E` dark ink | Text/icons on `accent`, `accentPressed` and `accentDeep` fills |
| `highlight` | `#008BA3` (non-text only, ≥ 3:1) | `#28D9F2` bright cyan | **Attention only** (§107): live indicator, keyboard focus, a brief genuine highlight. Never routine 4s/6s, never body text in light |
| `successSubtle` | `#DDF2E9` | `#0B2A22` | Qualified badge background |
| `warningSubtle` | `#FBEFDA` | `#2A2014` | Advisory banner background, Manual Override badge |
| `dangerSubtle` | `#FCE8E8` | `#2D1316` | Pressed WICKET key, error banner background |
| `onDanger` | `#FFFFFF` | `#1C0506` | Text on `danger` fills (the W ball chip, the destructive confirm button) |
| `focusRing` | `#008BA3` | `#28D9F2` | 2 px keyboard/switch-access focus outline (the `highlight` value) |
| `scrim` | `rgba(6,26,32,0.40)` | `rgba(2,7,9,0.64)` | Legacy solid scrim. Sheets and dialogs use `glass.scrim` (§1.4) |
| `inverseSurface` | `#0B232B` | `#E3ECF0` | Reserved (the pre-§106 light toast). Toasts are `popover` glass now |
| `inverseText` | `#F0F5F8` | `#070E12` | Text on `inverseSurface` |
| `inverseAccent` | `#5ED3E8` | `#00C2E0` | Reserved, paired with `inverseSurface` (dark: checked on `surfaceElevated`) |
| `chartSeries1` | `#0A96B2` cyan | `#19A2BE` cyan | Team batting first / innings 1 (THEMES.md §4) |
| `chartSeries2` | `#6650B8` muted violet | `#7A64D6` muted violet | Team batting second / innings 2 (never green: green is the success signal) |
| `chartGrid` | `#E1E9ED` | `#16242B` | Chart gridlines |

Rules: status colours (`success`, `warning`, `danger`) are never used as chart series or decoration, and no series is green: `chartSeries2` is a non-semantic muted violet, so green stays the success signal only (§107). `accent` is never used for an error. `highlight` is never a fill behind text and never marks a routine boundary. Only the cyan identity (`accent`, `accentPressed`, `focusRing`/`highlight`, `inverseAccent`) runs above 0.7 channel chroma, and nothing is a fully saturated colour at full brightness (`#00E5FF`-style neon is rejected by the adversarial design test).

### 1.3 Verified contrast (WCAG 2.2, relative luminance)

Computed with the WCAG formula for every text/background pairing the components use. WP-design-system's acceptance test recomputes them from `src/ui/theme` (≥ 4.5:1 for text, ≥ 3:1 for large text ≥ 24 px regular / 18.66 px bold and for UI component boundaries).

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| `textPrimary` / `background` | **14.83** | **18.00** | 4.5 (AAA 7) |
| `textPrimary` / `surface` | 16.29 | 16.82 | 4.5 |
| `textPrimary` / `surfaceElevated` | 16.29 | 15.23 | 4.5 |
| `textPrimary` / `surfaceSunken` | 13.47 | 18.53 | 4.5 |
| `textSecondary` / `background` | 6.88 | 7.72 | 4.5 |
| `textSecondary` / `surface` | 7.56 | 7.22 | 4.5 |
| `textSecondary` / `surfaceElevated` | 7.56 | 6.53 | 4.5 |
| `textSecondary` / `surfaceSunken` | 6.25 | 7.95 | 4.5 |
| `textMuted` / `background` | 5.13 | 6.35 | 4.5 |
| `textMuted` / `surface` | 5.63 | 5.93 | 4.5 |
| `textMuted` / `surfaceElevated` | 5.63 | 5.37 | 4.5 |
| `textMuted` / `surfaceSunken` | 4.66 | 6.53 | 4.5 |
| `score` / `background` | 16.25 | 18.82 | 3 (large) |
| `score` / `surface` | 17.85 | 17.58 | 3 (large) |
| `accent` / `background` (links, selected text) | 6.59 | 9.06 | 4.5 |
| `accent` / `surface` | 7.23 | 8.47 | 4.5 |
| `accent` / `surfaceElevated` | 7.23 | 7.67 | 4.5 |
| `accent` / `accentSubtle` (selected segment label) | 6.09 | 6.87 | 4.5 |
| `onAccent` / `accent` (primary button) | 7.23 | 9.28 | 4.5 |
| `onAccent` / `accentPressed` | 9.93 | 6.76 | 4.5 |
| `onAccent` / `accentDeep` (SIX chip) | 5.54 | 4.95 | 4.5 |
| `textPrimary` / `accentSubtle` (current batter row) | 13.71 | 13.63 | 4.5 |
| `success` / `surface` | 5.70 | 9.54 | 4.5 |
| `success` / `successSubtle` | 4.88 | 8.06 | 4.5 |
| `warning` / `surface` | 6.51 | 10.49 | 4.5 |
| `warning` / `warningSubtle` | 5.72 | 9.23 | 4.5 |
| `danger` / `surface` | 5.63 | 5.69 | 4.5 |
| `danger` / `background` | 5.13 | 6.09 | 4.5 |
| `danger` / `dangerSubtle` | 4.79 | 5.41 | 4.5 |
| `onDanger` / `danger` (W chip) | 5.63 | 6.13 | 4.5 |
| `textPrimary` / `warningSubtle` (banner body) | 14.32 | 14.79 | 4.5 |
| `textPrimary` / `dangerSubtle` | 13.84 | 15.99 | 4.5 |
| `borderStrong` / `surface` (input outline) | 3.92 | 3.68 | 3 (non-text) |
| `borderStrong` / `background` | 3.57 | 3.94 | 3 (non-text) |
| `focusRing` / `background` | 3.66 | 11.38 | 3 (non-text) |
| `focusRing` / `surface` | 4.02 | 10.63 | 3 (non-text) |
| `highlight` / `background` | 3.66 | 11.38 | 3 (non-text) |
| `highlight` / `surface` | 4.02 | 10.63 | 3 (non-text) |
| `border` / `surface` | 1.34 | 1.23 | none: decorative separator only; never the only boundary of a control |
| `inverseText` / `inverseSurface` | 14.83 | 16.22 | 4.5 |
| `inverseAccent` / `inverseSurface` | 9.27 | 7.67 (on `surfaceElevated`) | 4.5 |
| `chartSeries1` / `surface` | 3.49 | 6.01 | 3 (graphical object) |
| `chartSeries2` / `surface` | 6.17 | 4.00 | 3 (graphical object) |
| `chartSeries1` / `background` | 3.18 | 6.43 | 3 (graphical object) |
| `chartSeries2` / `background` | 5.62 | 4.28 | 3 (graphical object) |

**Why the light teal is `#00606F`.** The §107 deep teal `#008BA3` is only 4.02:1 on white and 3.66:1 on the ice page, so it may not carry text; in light it is the non-text `highlight`/`focusRing` (≥ 3:1). Light text, icons and interactive fills use `#00606F` (7.23:1 on white, 6.59:1 on ice), which also keeps AA on the light glass bars (§1.4); the softer `#007385` is the six-chip fill under white digits (5.54:1). Cyan proper appears in light only in rims, edges and the ambient light.

The chart pair (cyan + muted violet) passes the dataviz palette validator (lightness band, chroma floor, CVD separation, normal-vision floor, contrast vs surface) in both themes: light worst adjacent CVD ΔE 14.6 deutan (normal vision 19.7), dark 12.4 (18.8). Series text never uses these colours (THEMES.md §4).

Every text token reaches **≥ 4.5:1 on every surface it is placed on, in both themes**, `textMuted` included, so there are no low-contrast labels outdoors (§72). Disabled controls are the only exception: WCAG exempts them, they carry a "disabled" accessibility state and never carry information.

### 1.4 Glass material (§106, §107)

Glass is a **material**, not a colour: a frosted blur of whatever scrolls behind it, a tint, a 1 px rim whose **top-left edge is lit** (the specular edge that sells liquid glass), and a soft sheen at the top. The tokens live in `src/ui/theme/glass.ts` (`lightGlass`, `darkGlass`, exposed as `theme.glass` / `useGlass()`), the only other file besides `tokens.ts` allowed to contain colour literals. Feature code never sees these values; it uses the `src/ui/glass` components (§6.20).

**Hierarchy.** Solid content, glass controls. Glass belongs to the floating control and navigation layer: the tab bar, top bars (resting glass, stronger once content scrolls under them), bottom sheets, player sheets, dialogs, toasts, menus, segmented controls and filter/tab bars, the live-scoring dock, floating action buttons and the live score band. The page, tables, long lists, form fields, charts, score content and any text-dense content stay on `background`/`surface`. Scoring keys keep their solid `surface` faces: the dock around them is glass, the keys are not. **The scoring dock is the strongest glass element**: the densest chrome tint and its own stronger rim.

#### Elevation levels

Each level has a translucent **tint** (blurred renderers and iOS 26 native glass), a denser **unblurred** tint (floating glass where nothing can blur the backdrop: Android below 12 or outside a blur target, web without `backdrop-filter`), an **opaque twin** with the same RGB (Reduce Transparency, high contrast), a **blur** intensity (expo-blur 1–100; 100 is the §107 24 px frost on web, see the model below) and whether it carries the **sheen**.

| Level | Used by | Light tint / unblurred / opaque | Dark tint / unblurred / opaque | Blur | Sheen L / D |
|---|---|---|---|---|---|
| `bar` | Tab bar, top bars, top tabs, FAB, live score band | `rgba(252,254,255,0.60)` / `0.98` / `#FCFEFF` | `rgba(15,27,34,0.70)` / `0.98` / `#0F1B22` | 100 | yes / yes |
| `dock` | Scoring dock, sticky footers (strongest) | `rgba(252,254,255,0.66)` / `0.985` / `#FCFEFF` | `rgba(15,27,34,0.76)` / `0.985` / `#0F1B22` | 100 | yes / yes |
| `control` | Segmented-control track, floating filter bars | `rgba(232,240,244,0.64)` / `0.98` / `#E8F0F4` | `rgba(11,20,25,0.70)` / `0.98` / `#0B1419` | 90 | yes / yes |
| `popover` | Toasts, popovers | `rgba(252,254,255,0.86)` / `0.985` / `#FCFEFF` | `rgba(17,30,37,0.90)` / `0.985` / `#111E25` | 100 | yes / no |
| `sheet` | Bottom sheets, player sheets, dialogs, menus (they sit on the scrim and hold long text) | `rgba(252,254,255,0.88)` / `0.99` / `#FCFEFF` | `rgba(9,17,22,0.82)` / `0.99` / `#091116` | 100 | yes / no |

**Perceptible, not opaque.** The short-text chrome (bars, dock, controls, FAB) runs at the §107 values: **dark bars are exactly `rgba(15,27,34,0.70)`**, light bars a pale 0.60 white, so the colour masses of what scrolls beneath (cards, buttons, chips, the ambient light) show through the 24 px frost, boosted by a 160–170% backdrop saturation. AA is kept by **glass inks** rather than by a denser tint (below). The dock is still the strongest (0.76 dark / 0.66 light, stronger rim). Sheets, dialogs and popovers stay denser because they carry long text; the dark sheet is a deeper charcoal than the page's cards so in-sheet rows (raised to `surfaceElevated`) stand apart at ≥ 1.15:1.

**Resting state.** A top bar is never invisible: at rest (nothing scrolled beneath it) it shows its tint, sheen and bottom rim at `glass.rest` = 60% strength; once content scrolls under it the tint rises to 100% and the soft lift appears in light. The frost layer sits outside the fading layer, so on web no ancestor opacity ever cuts the `backdrop-filter` off. Under Reduce Transparency a resting bar is fully opaque (never a part-transparent opaque fill).

#### Rims, edges, sheen, selection, scrim, ambient

| Token | Light | Dark | Use |
|---|---|---|---|
| `rim.color` / `rim.top` / `rim.left` (1 pt) | white 70% / 92% / 84% | `rgba(0,194,224,0.20)` / `rgba(40,217,242,0.40)` / `rgba(40,217,242,0.30)` | The rim. Top brightest, left next, right and bottom the base: a top-left light source. Dark rims are soft cyan, never white glare |
| `level.dock.rim` | white 80% / 94% / 88% | `rgba(0,194,224,0.30)` / `rgba(40,217,242,0.50)` / `rgba(40,217,242,0.38)` | The dock's stronger rim (`glassRimFor(palette, level)` returns the level rim or the shared one) |
| `edge.color` (1 px) | `rgba(0,139,163,0.30)` faint cyan | `rgba(1,5,7,0.60)` | Outer 1 px line that separates glass from a same-tone page: in light the near-white rim sits just inside it, so the edge reads as a highlight over a soft line even over white rows |
| `sheen.from` → `to` (top 45%) | `rgba(255,255,255,0.65)` → 0 | `rgba(40,217,242,0.07)` → 0 faint cyan | Visible specular gradient on the blur fallback |
| `ink.secondary` / `ink.accent` | `#2F4954` / `#004D5A` | `#ABBDC7` / `#26CCE6` | **Glass inks**: secondary, muted and accent text on `bar`, `dock` and `control` glass (see below) |
| `rest` | 0.6 | 0.6 | Strength of a resting top bar's tint and rim |
| `saturation` | 1.7 | 1.6 | Web `backdrop-filter` saturation, so colour under the glass shows through without glowing |
| `selection` + `selectionRim` | ice lens `rgba(214,239,245,0.78)` + `rgba(0,96,111,0.55)` | deep teal lens `rgba(0,72,86,0.55)` + `rgba(0,194,224,0.50)` | The selected "lens" of the selected segment (fill **and** outline, so selection reads by shape) |
| `pressed` | `rgba(10,34,41,0.06)` | `rgba(1,6,8,0.30)` | Pressed state of controls on glass |
| `scrim.color` / `scrim.reduced` | `rgba(6,26,32,0.40)` / `0.52` | `rgba(2,7,9,0.60)` / `0.76` | Behind sheets and dialogs, strong enough that the page reads as inactive; the denser value applies when transparency is reduced or contrast is high |
| `ambient.primary` / `secondary` | faint cyan `rgba(0,194,224,0.07)` top-left / white light `rgba(255,255,255,0.60)` centre-right | `#0D3843` at 18% top-left / `#08313A` at 10% centre-right | The §107 page atmosphere behind **every** `Screen` (§6.20) |
| `shadow` | `#06222B`, opacity 0.10, radius 24, offset {0, 8} | none | Soft lift for **floating** glass only (dialog, toast, FAB; the docked tab bar has none). Dark elevation stays tonal |
| `liquid` (fill / edge / glow / rim / line) | `#0AA6C2` 0.10 → 0.26 / `#00606F` 0.30 / `#00C2E0` 0.14 / `#00A9C7` 0.75 / `#008BA3` 0.24 | `#00C2E0` 0.12 → 0.30 / `#28D9F2` 0.45 / `#00C2E0` 0.16 / `#28D9F2` 0.80 / `#28D9F2` 0.18 | The tab bar's liquid droplet and its top edge (§6.6). Balanced cyan: tinted, never a solid neon puck. `liquid.ink` is the icon ink inside it: glass accent in light, `textPrimary` in dark (cyan on cyan would fall below 3:1); both stay ≥ 3:1 over the worst backdrop. The glow stops above the caption, so the accent caption keeps its ≥ 4.5:1 |

**Ambient atmosphere.** `AmbientBackground` paints two very large, very soft radial glows with `react-native-svg` (`objectBoundingBox` units, so they stretch with the screen): `primary` centred at (6%, 2%) with radius 85%, `secondary` centred at (92%, 46%) with radius 56%, each fading on an eased curve (six stops, weight `(e^(−3t²) − e^(−3)) / (1 − e^(−3))`) to nothing, so there is no ring edge and no blob. The bottom of the screen falls back to the plain `#070E12`. The lit page stays within 1.1:1 of the plain page (dark 1.076, light 1.036), and every text token stays ≥ 4.5:1 on it. Reduce Transparency keeps the glows (they are light on the page, not glass); the system high-contrast setting removes them.

Glass radii (`theme.glass.radius`) are larger and continuous, and are used **only** by glass chrome: `control` 12, `popover` 16, `dialog` 22, `sheet` 24, `dock` 24, `pill` 999 (FAB). Content keeps the §4.1 maximum of 10.

#### Inks allowed on glass and verified contrast

Text on glass must meet WCAG AA against the **worst-case content behind it**, under a blur-aware model (ACCESSIBILITY.md §7.1): blurred levels are checked over every solid field (page, surfaces, subtle tints, the ambient-lit page) mixed with a button-sized block of every bright fill (coverage 0.757 at σ 24 px) and with dense detail of every ink (coverage 0.199), in sRGB and in linear light; unblurred tints are checked over raw white, raw black and every token. Sheets add the scrim. Tint + sheen are composited both ways. Only the inks listed per level (`GLASS_INKS`) may be used on that level; `textMuted` is never used on bars, docks or controls.

**Glass inks.** On the short-text levels (`GLASS_INK_LEVELS` = `bar`, `dock`, `control`) every `GlassSurface` re-inks its children through a scoped theme (`GlassInkScope` → `glassInkTheme(theme)`): `textSecondary` and `textMuted` become `glass.ink.secondary`, `accent` becomes `glass.ink.accent`; `textPrimary`, `score` and the status colours are unchanged. The glass inks are one small step further from the tint than the page inks (light: deeper teal-slate `#2F4954` and deep teal `#004D5A`; dark: paler slate `#ABBDC7` and a cyan `#26CCE6` that stays below the attention cyan). That is what lets the bars drop to 0.60 / 0.70 and still pass. Under high contrast the secondary ink is `textPrimary`. Sheets and popovers keep the page inks. Feature code needs nothing: any `Text`, `Icon` or `Button` inside the header, tab bar, dock, FAB or a segmented control picks the glass inks up.

| Level | Allowed inks (glass inks applied) | Worst case light (blurred · unblurred) | Worst case dark (blurred · unblurred) |
|---|---|---|---|
| `bar` | `textPrimary`, `textSecondary`, `accent`, `score` | 8.96, 5.25, 5.23, 9.82 · 15.41, 9.03, 9.00, 16.89 | 8.26, 4.60, 4.61, 8.63 · 13.40, 7.46, 7.48, 14.01 |
| `dock` | `textPrimary`, `textSecondary`, `accent`, `score` | 9.86, 5.77, 5.76, 10.81 · 15.58, 9.13, 9.09, 17.08 | 9.26, 5.16, 5.17, 9.69 · 13.59, 7.57, 7.59, 14.20 |
| `control` | `textPrimary`, `textSecondary`, `accent` | 8.38, 4.91, 4.89 · 13.52, 7.92, 7.89 | 8.68, 4.84, 4.85 · 14.50, 8.08, 8.10 |
| `popover` | `textPrimary`, `textSecondary`, `accent`, `success`, `warning`, `danger`, `score` | 13.29, 6.17, 5.91, 4.66, 5.31, 4.60, 14.57 · 15.58, 7.23, 6.92, 5.46, 6.22, 5.39, 17.08 | 13.52, 5.80, 6.81, 7.67, 8.43, 4.57, 14.14 · 15.15, 6.50, 7.63, 8.60, 9.45, 5.13, 15.84 |
| `sheet` | every text token, `textMuted` included | `textMuted` 4.57 · 5.45, `danger` 4.57 · 5.45, all others higher | `danger` 5.53 · 5.92, `textMuted` 5.76 · 6.17, all others higher |

Tab-bar lens states (glass inks): pressed ≥ 4.71 (light) / 6.33 (dark); selected `accent` 7.28 / 4.96; selected and pressed 6.50 / 6.67. The selected segment's 1.5 pt glass-accent outline is 8.24:1 (light) / 9.63:1 (dark) against the opaque control track and 8.39 / 9.76 against the tinted track over the page, well above the 3:1 WCAG 1.4.11 asks for a selection boundary. On the opaque twins (transparency reduced) every text token is at least 5.57:1 (light) and 5.32:1 (dark), the three `control` inks at least 6.27 / 7.40. `src/ui/theme/__tests__/glass.test.ts` recomputes all of this, and proves that the page `textSecondary` (dark) and page `accent` (light) would fail on the 0.70 / 0.60 bars without the glass inks.

#### Platforms (the renderer)

`useGlassRenderer()` picks one of four renderers; every glass component goes through it.

| Renderer | When | What renders |
|---|---|---|
| `liquid` | iOS 26+ with `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` true | Native Liquid Glass: `expo-glass-effect` `GlassView` (`glassEffectStyle` regular, `tintColor` = level tint, `colorScheme` = app theme, `isInteractive` for tappable chrome unless motion is reduced). Neighbouring glass can merge through `GlassGroup` (`GlassContainer`) |
| `blur` | Older iOS, Android 12+ inside a blur target, web with `backdrop-filter` | `expo-blur` `BlurView` (ultra-thin material, level intensity; Android halves intensity with `blurReductionFactor` 2) or on web CSS `backdrop-filter: saturate(170% light / 160% dark) blur(σ px)` + level tint + sheen + top-left-lit rim + 1 px edge. Saturation lifts the colour of content passing under the glass so the frost is perceptible, but stays low enough that cyan content never glows |
| `unblurred` | Floating glass where nothing can blur (Android < 12 or outside the blur target, web without `backdrop-filter`) | The level's near-opaque `unblurred` tint (0.98–0.99), sheen, rim and edge. Without a blur nothing may read through the chrome: text behind it stays under 1.06:1 (bars, dock, controls) and 1.05:1 (sheets, dialogs, toasts) against its own background. Android QA showed 0.95 still left large dark text faintly readable under the tab labels |
| `opaque` | Reduce Transparency (system or in-app), or the system high-contrast setting | The level's opaque twin with a solid `border` (`borderStrong` in high contrast) edge; no blur, no sheen, no rim; denser scrim |

---

## 2. Typography

Fonts are bundled through `@expo-google-fonts/inter` and `@expo-google-fonts/barlow-condensed` and loaded in `src/app/_layout.tsx` before the bootstrap gate hides the splash. The weights loaded are Inter 400/500/600/700 and Barlow Condensed 500/600/700. Nothing else ships.

**Tabular numerals are mandatory for every number.** Both families contain an OpenType `tnum` feature, but their **default digits are proportional**. Measured advance widths are Barlow Condensed 600: `1` = 274 vs `4` = 459 units; Inter 400: `1` = 833 vs `4` = 1323. Every numeric style therefore sets `fontVariant: ['tabular-nums']`, so 142/4 → 146/4 does not shift the layout and table columns align. React Native maps this to `fontFeatureSettings: 'tnum'` on Android and to the font-descriptor feature on iOS.

### 2.1 Numeric styles: Barlow Condensed, tabular

| Variant | Weight | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `scoreHero` | 600 | 64 / 64 | −0.5 | Live score `142/4` (§10). 52/52 on width < 360, 72/72 in the tablet scoring pane |
| `scoreLarge` | 600 | 40 / 44 | 0 | Overs `16.4` beside the hero score; Continue Match score on Home |
| `scoreMedium` | 600 | 28 / 32 | 0 | Innings totals on the scorecard, the result figure, bracket scores |
| `scoreKey` | 600 | 32 / 36 | 0 | Digits on the scoring pad |
| `figure` | 500 | 22 / 26 | 0 | Batter runs, bowler figures on the live screen |
| `figureSmall` | 500 | 17 / 20 | 0 | Ball chips (32 px), bracket match scores |

### 2.2 UI styles: Inter

| Variant | Weight | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `title1` | 700 | 28 / 34 | −0.3 | Screen titles on tab roots ("Scorebook", "Tournaments") |
| `title2` | 600 | 22 / 28 | −0.2 | Stack screen titles, dialog titles, tournament name |
| `headline` | 600 | 17 / 24 | 0 | Row titles that lead a section, sheet titles, team names in headers |
| `body` | 400 | 16 / 24 | 0 | Default text, list rows |
| `bodyStrong` | 600 | 16 / 24 | 0 | Emphasis, button labels (md/lg) |
| `callout` | 400 | 15 / 22 | 0 | Result lines, explanations (§98) |
| `subhead` | 500 | 14 / 20 | 0 | Field labels, secondary row text on the live screen |
| `footnote` | 400 | 13 / 18 | 0 | Metadata (date · format · venue), helper text |
| `label` | 600 | 12 / 16 | +0.8, UPPERCASE | Section headers ("THIS OVER", "STANDINGS"), table headers, rate labels (`CRR`, `RRR`) |
| `tableNumeric` | 500 | 15 / 20 | 0, tabular | Every numeric table cell (P W L NR Pts NRR, R B 4s 6s SR, O M R W Econ) |
| `keyLabel` | 700 | 15 / 18 | +0.8, UPPERCASE | `EXTRAS`, `WICKET` on the scoring pad; `NEW MATCH` on Home |

Rules:
- The minimum size is 12 px, and only for uppercase `label`. Nothing on the live scoring screen is smaller than 14 px apart from `label`.
- Italic is not used. Emphasis comes from weight.
- Case: sentence case for titles, buttons and messages. UPPERCASE only for `label`/`keyLabel` and the §5/§9 capitalised CTAs (`NEW MATCH`, `EXTRAS`, `WICKET`, `RESUME`, `SAVE & EXIT`, `DISCARD`).
- Numbers come from `domain/scoring/format` (`formatScore`, `formatOvers`, `formatRate`, `formatNrr`, `formatBowlingFigures`). The UI never formats cricket numbers itself.
- Font scaling caps (`maxFontSizeMultiplier`) are listed in [RESPONSIVE.md §5](RESPONSIVE.md).

---

## 3. Spacing (§67)

Scale (pt): **4, 8, 12, 16, 20, 24, 32, 40, 48**. These are the only values allowed for padding, margin and gap.

| Token | Value | Typical use |
|---|---|---|
| `space.xxs` | 4 | Icon-to-label gap, chip internal padding |
| `space.xs` | 8 | Gap between ball chips; gap between scoring keys; stacked text lines |
| `space.sm` | 12 | Row vertical padding (compact), form field gap |
| `space.md` | 16 | **Screen side gutter (phones)**, row horizontal padding, sheet padding |
| `space.lg` | 20 | Space between score block elements |
| `space.xl` | 24 | Section top padding, dialog padding, **tablet gutter** |
| `space.2xl` | 32 | Between major sections (above the boundary rule) |
| `space.3xl` | 40 | Empty-state top offset |
| `space.4xl` | 48 | Bottom padding above a sticky CTA; empty-state vertical rhythm |

Hit areas are not spacing. A control whose visible height is under 44 gets `hitSlop` to reach 44 × 44 (§72).

---

## 4. Radius, borders, elevation

### 4.1 Radius: restrained, 10 max on content

Content (rows, tables, keys, inputs, chips) never goes above 10. The larger, continuous glass radii in §1.4 (`theme.glass.radius`: 12 / 16 / 22 / 24 / pill) belong to glass chrome only, and the glass components apply them themselves; feature code does not pick them.

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | Rows, tables, sections, the tab bar, full-bleed banners. **Content is never in rounded cards.** |
| `radius.xs` | 2 | W ball chip (square), badges, focus ring corner on square items |
| `radius.sm` | 4 | Extras chips (WD/NB rectangles), tags, toast |
| `radius.md` | 6 | Buttons, inputs, scoring keys, segmented control, steppers |
| `radius.lg` | 8 | Solid (non-glass) callouts |
| `radius.xl` | 10 | The maximum for any content element. Sheets and dialogs are glass and use `glass.radius.sheet` 24 / `glass.radius.dialog` 22 |
| `radius.round` | 50% | Only for run ball chips (a ball is round) and switch thumbs. Not a style choice elsewhere |

### 4.2 Borders

| Token | Width | Colour | Use |
|---|---|---|---|
| `border.hairline` | `StyleSheet.hairlineWidth` | `border` | Row and table separators, section edges |
| `border.control` | 1 | `borderStrong` | Inputs, secondary buttons, scoring keys, outlined chips |
| `border.emphasis` | 2 | `accent` / `danger` | Selected option, focused input, the FOUR chip, the WICKET key |
| `border.focus` | 2, offset 2 | `focusRing` | Focus-visible outline (external keyboard, switch access) |
| **Section rule** (`BoundaryRule`, default `tone="section"`) | one hairline, snapped to a whole device pixel | `border` | Between sections and innings, under the tournament header, above "CONTINUE MATCH". Quiet: a near-white 2 px stripe fights the glass and hairline language |
| **Band rule** (`BoundaryRule tone="band"`) | 2 + gap 2 + 1 | `accentDeep` (2 px) and `border` (1 px) | Reserved for the live score band only, if anywhere |

Separators are full-bleed inside sections. Rows inside a list use **one** inset token (`LIST_SEPARATOR_INSET`, 16), whatever their leading slot, and every hairline is snapped to a whole device pixel (`snapHairline`), so no row is ruled heavier than its neighbour. Draw separators in one place only: the `ListRow`/`ChoiceList` separator inside a grouped list, none inside card mode.

### 4.3 Elevation: minimal, and carried by the glass

| Level | Light | Dark | Used by |
|---|---|---|---|
| 0 | none | none | Everything on the page, including scoring keys |
| 1 (raised content) | `theme.elevation.raised`: iOS `shadowColor #06222B, opacity 0.10, radius 16, offset {0, 4}`; Android `elevation 6` | no shadow; 1 px `border` top edge | Rare raised content (not used by glass) |
| Glass | `glass.shadow`: `#06222B`, opacity 0.10, radius 24, offset {0, 8}, plus the near-white rim | no shadow; the tint, the soft cyan rim and its lit top-left edge separate it | Floating glass: tab bar, dialog, toast, FAB (`GlassSurface elevated`) |

No other shadows, and never a shadow on content. Top bars rest as `bar` glass at 60% strength with their bottom edge; once content scrolls under them they strengthen to full tint and, in light, take the glass lift (§6.20). Floating and side sheets on tablets take the glass lift too; a phone bottom sheet does not.

---

## 5. Iconography

- The library is `lucide-react-native`. Stroke 1.75 at 20/24 px and 2 at 16 px. Colour comes from the text token of the context.
- Sizes: 16 (inline with footnote), **20 (default)**, 24 (tab bar, top bar actions). The maximum is 24 in UI and 32 in an EmptyState. There are no giant icons (§1).
- Icons never stand alone for a state. They accompany a text label, or an icon-only button carries an `accessibilityLabel`.

| Concept | Icon |
|---|---|
| Home / Tournaments / History / Settings tabs | `house` / `trophy` / `history` / `settings` |
| Undo / Redo / Swap strike / More | `undo-2` / `redo-2` / `arrow-left-right` / `ellipsis` |
| Striker marker | custom filled right-pointing triangle, 10 px, `accent` |
| Current bowler marker | lucide `circle-dot` 16 px |
| Wicket key | custom stumps glyph 20 px |
| Extras key | `plus` 20 px |
| Add | `plus` |
| Back | `chevron-left` |
| Row navigation | `chevron-right` 20 px `textMuted` |
| Warning / error / success / info | `triangle-alert` / `circle-alert` / `circle-check` / `info` |
| Manual override | `pencil-line` |
| Share / export PDF / backup | `share` / `file-text` / `hard-drive-download` |
| Pause / resume play | `cloud-rain` (rain) or `pause` / `play` |
| Qualified / eliminated | `check` / `x` inside the text badge |

---

## 6. Components

All components live in `src/ui/primitives` or `src/ui/scoreboard`. They take plain props, import no domain, stores or services, expose `accessibilityRole` and `accessibilityLabel`, and honour `useReducedMotion()` from the theme context. Sizes are in pt.

### 6.1 Button

| Variant | Background | Label | Border | Use |
|---|---|---|---|---|
| `primary` | `accent` → pressed `accentPressed` | `onAccent` | none | One per screen: NEW MATCH, Start match, Confirm result, Continue (impact) |
| `secondary` | `surface` → pressed `surfaceSunken` | `textPrimary` | 1 `borderStrong` | Alternatives: SAVE & EXIT, Cancel in sheets |
| `tertiary` | transparent → pressed `surfaceSunken` | `accent` | none | Inline actions: "See all", "Change", "Undo last ball" |
| `destructive` | `surface` → pressed `dangerSubtle` | `danger` | 1 `danger` | DISCARD, Delete, Withdraw team (the step that opens confirmation) |
| `destructiveConfirm` | `danger` → pressed 88% opacity | `onDanger` | none | The final confirm inside a destructive Dialog only |

| Size | Height | Padding x | Label | Icon |
|---|---|---|---|---|
| `lg` | 56 | 24 | `bodyStrong` 16 | 20 |
| `md` (default) | 48 | 20 | `bodyStrong` 16 | 20 |
| `sm` | 44 (compact in width and type, never in height: web ignores `hitSlop`) | 12 | `subhead` 600 14 | 16 |

- **States:** default; pressed (instant background swap, no scale, no opacity flash); disabled (`accessibilityState.disabled` + `aria-disabled`, `textMuted` label, and a surface that is never more prominent than the enabled one: `tertiary` stays transparent text, `secondary`/`destructive` keep a quiet 1 pt `border` outline on transparent, filled variants sit on `disabledFill(theme)` = `surfaceSunken` in light and the raised charcoal `surfaceElevated` in dark, never the near-black sunken well); loading (spinner 20 replaces the icon, the label stays, width is fixed, presses are ignored, `accessibilityState.busy`); focus (`border.focus`).
- Full-width buttons are used only at the bottom of forms, wizards and sheets. Bottom CTAs sit in a sticky footer: `<Screen footer={…}>`, a floating `dock` glass panel with 24 pt top corners, a lit top rim, padding 16 plus the safe-area inset, and the content scrolling beneath it (§6.20).
- Icon-only buttons (`IconButton`) are 44 × 44, with the icon at 24 and `accessibilityLabel` required by the type.

### 6.2 ScoreKey: scoring pad key (§9, §72)

The eight primary keys are `0 1 2 3 4 6 EXTRAS WICKET`, laid out as a 4 × 2 grid.

| Property | Value |
|---|---|
| Grid | 4 columns × 2 rows, gap 8, pad padding 16 horizontal / 12 vertical. On the live screen the pad sits in the glass scoring dock with no background of its own (`ScoringPad well={false}`, §7); elsewhere (edit ball) it sits in a `surfaceSunken` well |
| Key size | width = (screen width − 32 − 24) / 4; height **72** on standard phones (≥ 667 pt tall), **64** on short phones, **56 minimum** (width < 340 or height < 600). Tablet pane: 80 |
| Row order | Row 1: `0 1 2 3`. Row 2: `4 6 EXTRAS WICKET`. The most frequent keys sit in the middle of the thumb arc, WICKET at bottom-right (right-hand thumb). A **left-handed pad** setting that mirrors row 2 is recommended (see ACCESSIBILITY.md §9). It needs a `ScoringPreferences` field, so it is reported as a contract gap |
| Run keys (`0`–`6`) | **Solid** `surface` background (never glass, §106), 1 `borderStrong`, radius 6, label `scoreKey` in `score` colour. `0` shows `0` or `•` per `settings.scoring.dotStyle` |
| `4`, `6` keys | Same as run keys, plus a small `label` caption under the digit: `FOUR`, `SIX` (`textSecondary`). This gives an extra non-colour cue and prevents a mistaken 4/6 |
| EXTRAS | `surface`, 1 `borderStrong`, `plus` icon 20 above `keyLabel` `EXTRAS` (`textPrimary`). The label fits the key width (shrinks, never below 12 pt, never ellipsised) |
| WICKET | `surface`, **2 `danger` border**, stumps glyph 20 above `keyLabel` `WICKET` in `danger`; fits the key width like EXTRAS |
| Pressed | Run keys and EXTRAS → `accentSubtle`; WICKET → `dangerSubtle`. The swap happens on `onPressIn` with no delay |
| Busy (a commit in flight) | Keys stay enabled visually. A second tap is queued by the store (dispatches are serialised, ARCHITECTURE §5.1), so rapid scoring is never dropped |
| Disabled (`!canRecordDelivery`) | The pad is covered by the pending-action panel (§7 below), so it never shows greyed keys the scorer might try to use |
| Accessibility | role `button`. Labels: "Zero runs" / "Dot ball", "One run", …, "Four runs, boundary", "Six runs, boundary", "Extras", "Wicket". Hint on WICKET: "Opens dismissal options" |

### 6.3 BallChip: delivery token (§13, §78)

Props are `{ text, kind, isFreeHit, size }` and come from the domain `BallToken` (`text`, `kind`, `accessibilityLabel`). **Shape and label carry the meaning; colour only reinforces it.** A scorer on a greyscale screen, or with colour-vision deficiency, reads the same thing.

Shape grammar:
- **Circle** = a runs delivery off the bat (legal ball).
- **Capsule** (fully rounded ends) = legal extras: byes and leg byes.
- **Square-cornered rectangle, dashed outline** = not a legal delivery (wide, no-ball). It does not use up a ball of the over.
- **Filled square** = a wicket fell on this delivery.

| Token text (domain grammar) | `kind` | Shape | Fill | Border | Text colour / weight |
|---|---|---|---|---|---|
| `0` or `•` | `dot` | circle | none | 1 `border` | `textMuted` / 500 |
| `1` `2` `3` `5` (and `1s`, `2s`) | `runs` | circle | none | 1 `borderStrong` | `textPrimary` / 600 |
| `4` | `four` | circle | none | **2 `accent`** | `accent` / 700 |
| `6` | `six` | circle | **`accentDeep`** (deep teal) | none | `onAccent` / 700 |
| `W`, `1+W`, `WD+W`, `NB+1+W` | `wicket` | square, radius 2 | **`danger`** | none | `onDanger` / 700 |
| `WD`, `WD+1`…`WD+4` | `wide` | rectangle, radius 2 | none | 1 **dashed** `borderStrong` | `textSecondary` / 600 |
| `NB`, `NB+4`, `NB+2B`, `NB+1LB` | `no_ball` | rectangle, radius 2 | none | 1 **dashed** `borderStrong` | `textSecondary` / 600 |
| `B1`…`B4` | `bye` | capsule | none | 1 `borderStrong` | `textSecondary` / 600 |
| `LB1`…`LB4` | `leg_bye` | capsule | none | 1 `borderStrong` | `textSecondary` / 600 |

- **Free hit** (`isFreeHit`): a 2 px `warning` bar under the chip, full chip width, 2 px below it. The accessibility label gets ", free hit". The strip header also shows the text `FREE HIT` (§20), so this is never colour-only.
- **Short runs** (`1s`): the `s` is set as a 70% size superscript in the same colour. The label is the domain's "One run, one short".
- **Sizes**: `lg` 32 (current-over strip; circle 32 × 32; rectangles/capsules height 32, min width 32, padding x 8; text `figureSmall` 17). `md` 24 (ball log, over summaries; text 14 Barlow Condensed 600). `sm` 20 (scorecard over summary; text 12). Chips never wrap text. Rectangle width grows with text.
- **Placeholder** (legal ball still due in the over): a `lg` circle with a 1 px dotted `border` and no text. It is exposed to accessibility only in aggregate: "2 balls left in the over".
- **Combined tokens**: `kind` decides the visual. The domain assigns `wicket` to any token containing `W`. This design assumes that precedence; see the contract note in the result report.
- The dashed border uses `borderStyle: 'dashed'` with `borderRadius: 2`. If the dashed style does not render on some Android version, fall back to a solid 1 px border plus a 3 px notch gap at the top centre (an SVG-drawn outline in `src/ui/scoreboard/BallChip`).
- In dark theme the mapping is the same, using dark tokens (THEMES.md §3).
- **Restrained boundaries (§107).** The FOUR ring is `accent`, the SIX is a solid deep-teal disc, and no chip is ever painted in `highlight`: ultra-bright cyan is reserved for genuine attention moments, so an over full of boundaries still reads calm.

### 6.4 OverStrip (§13)

A horizontal row: the `label` "THIS OVER" (or "OVER 17" when read back), then chips at gap 8, then placeholders for the legal balls still due. Height 48, horizontally scrollable when the over has many extras (auto-scrolled to the end, with a fading hairline edge rather than a gradient). A free-hit delivery carries a visible **FH** micro-label in `warning` under a 2 pt `warning` bar (`FREE_HIT_MARK`), not only a coloured line. Ball-log grids that wrap (scorecard overs, edit-ball) should use the `md` chip size with a 4 pt gap, or a `ScrollRow`, so up to nine deliveries stay on one row at 390. The trailing end shows the over's runs so far as a `figureSmall` number with the `label` "RUNS". At over end the strip shows the finished over until the first delivery of the next over; motion is in §8.

### 6.5 Table

| Part | Spec |
|---|---|
| Header row | height 36, `label` style `textSecondary`, hairline bottom border, background `surface` (sticky in scrolling tables) |
| Body row | min height 44 (48 when the row is tappable), `tableNumeric` for numbers, `body` for names, hairline separators, no zebra stripes |
| Alignment | Names left; numbers **right-aligned**, tabular; decimal columns (SR, Econ, NRR) right-aligned to the same number of decimals from `format.ts` |
| Column widths | First column `flex: 1` with min 120; numeric columns fixed: 1–2 digits 32, 3 digits 40, decimals 56, NRR 64 (sign included). Gap 8 after the name column, 4 between numeric columns (`TABLE_NAME_GAP`, `TABLE_NUMERIC_GAP`) |
| Standings widths | Standings values vary in width (`+11.500`, double-digit points), so the standings table sizes each numeric column to the widest of its header word and its values at the current font scale (`contentWidth`), with `space.sm` (8) between numeric columns and after the team. Headers wrap, never truncate. At `medium`/`expanded` the team column gets at least 152 (scaled) before optional columns drop; all remaining width goes to the team. Values may shrink to fit but never below 12 pt |
| Emphasis row | Current batter / bowler / own team: `accentSubtle` background **plus** a 3 px `accent` bar on the leading edge **plus** a marker glyph (▶ striker, `circle-dot` bowler). Three cues, never colour alone |
| Subtext | Dismissal text ("c Rizwan b Hassan") on a second line in `footnote` `textSecondary` |
| Overflow | `scrollable="auto"` (default): when `tableMinWidth(columns)` exceeds the measured width, the first column is pinned and the rest scrolls sideways, with an `EdgeFades` affordance (surface-coloured fade + chevron) on the side that has more. `true` always splits, `false` never does |
| Totals row | `bodyStrong`, hairline top border plus the boundary rule for the innings total |
| Empty | One row spanning all columns: "No matches played yet" in `textMuted` |
| Accessibility | Each row is one accessible element: "Position 1, Tigers, played 3, won 3, lost 0, no result 0, points 6, net run rate plus 1.234, qualified". Header cells are hidden from the reader (their meaning is included in row labels) |

### 6.6 Tabs (top tabs)

Used for scorecard innings, standings pools and stats categories. Height 44. The tab row is a `bar` glass strip with a hairline bottom edge (`<Tabs floating>` adds the live blur when the row floats over content; inline it is the tint without blur). Labels `subhead` 600 (selected, `textPrimary`) or 500 (unselected, glass `textSecondary`). The selected indicator is a 3 pt rounded `accent` underline across the label width, independent of focus, so selection shows by weight, underline and colour in both themes. Tabs are built on `ScrollRow`: they scroll horizontally when they exceed the width, the selected tab is always scrolled into view (also when it is selected before layout), and `EdgeFades` show a fade and chevron on any side with more tabs. Role `tablist`/`tab` with `accessibilityState.selected` and `aria-selected` on web. Role `tablist`/`tab` with `accessibilityState.selected`. Swiping between tab panes is optional; every tab is also tappable (§72: nothing hidden behind gestures).

**Bottom tab bar** (`(tabs)/_layout.tsx` → `RouterTabBar`/`TabBar`, cleanup brief 2026-10-05): 4 items (Home · Tournaments · History · Settings) on **one docked glass surface**, not a floating capsule and not a pill on top of a block.

| Part | Spec |
|---|---|
| Surface | `bar` glass, edge to edge, square corners, docked to the bottom of the screen. It runs down into the home-indicator / gesture area and behind Android's 3-button bar, so no strip of page shows under it. A 24 pt fade (page colour at 0 → `glass.fade`) sits just above it, so content dissolves into the bar instead of meeting a hard block edge |
| Top edge | No box border. A 1 pt `liquid.line` hairline that fades out over the outer 16% on each side (light catching the glass), drawn in the same SVG as the liquid. Reduce Transparency: the opaque `bar` twin with the opaque hairline edge instead, no fade |
| Row | 56 pt tall, centred, at most 520 wide, 4 pt below the top edge (`TAB_BAR_TOP`), 16 from the sides (8 below 360 wide) plus any landscape side inset |
| Metrics | `tabBarMetrics(inset)` → height 60, bottom = the safe-area inset (8 when there is none), footprint = 60 + bottom: 94 on iOS (34), 84 with gesture navigation (24), 108 with the Android 3-button bar (48), 68 with no inset. `TabChrome` publishes `footprint − inset` (always 60, or 68 without an inset) as bottom chrome, so the height never changes between screens |
| Items | Icon 24 (centre 18 pt below the top edge) above a 12 pt `label` caption, 4 pt apart. Items size to their labels (`flexGrow 1, flexShrink 1, flexBasis auto`), ≥ 44 pt, caption capped at 1.5× and never ellipsized ("Tournaments" fits at 320 wide) |
| Active state | A **liquid droplet** hanging from the top edge, fused to it by concave 12 pt fillets and closed by a rounded bottom 2 pt below the icon: half-width 22 (16–22, from the narrowest tab), depth 32. Fill: `liquid.fill` from `fillTop` at the edge to `fillBottom` at the bottom; a 1 pt `liquid.edge` refraction line on its lower half only; a soft radial `liquid.glow` under it; a `liquid.rim` highlight on the top edge either side of it that fades to nothing. Icon in `liquid.ink` (glass accent in light, `textPrimary` in dark), caption in glass accent, 600. No onAccent puck, no lens, no outline box |
| Unselected | Glass `textSecondary` icon and caption, caption 500. Pressed: the icon and caption dim to `PRESSED_OPACITY`; no wash, no rectangle |
| Change | The droplet's leading end moves in 300 ms (ease-out `bezier(0.22, 1, 0.36, 1)`), its trailing end follows in 460 ms (`bezier(0.65, 0, 0.35, 1)`), so the liquid stretches along the top edge, shallower and narrower at the trailing end with a raised neck between, then settles into the new tab. Icons and captions it passes under cross-fade to accent together (each caption is a 600 accent layer over a 500 secondary layer, both driven by the droplet, so a label never lights before the liquid reaches it; the row is sized by the 600 layer, so widths never jump). No spring, no overshoot, no loop: nothing moves at rest. Light haptic on change (`onSelectionChange`). Reduced motion: the droplet jumps |
| Keyboard | Android (edge-to-edge): while the keyboard is up the bar is hidden (opacity 0, no touches, hidden from screen readers) and comes back unchanged; its height and the published chrome never change. iOS: the keyboard covers it |
| Implementation | `liquid.ts` geometry helpers are all `'worklet'` functions with no parameter defaults that read outside values; the paths are animated SVG props driven on the UI thread (`useDerivedValue` → `useAnimatedProps`), no per-frame JS. The canvas spans the whole surface so nothing is clipped at the row edge. It mounts only once the droplet has a measured position, and an unplaced path is a 2 × 2 square parked off the canvas, never an empty path: Android rejects a gradient on a zero-size shape (`ending radius must be > 0`) |

Content scrolls beneath the bar; every tab screen pads its last item clear of the footprint through `useContentInsets()` / `useScreenList()` (§6.20).

### 6.7 SegmentedControl

Track: `control` glass, radius 12, padding 2, height 44 (segments 40). Inline in a form the track is the glass tint without blur; `floating` adds the blur and the glass lift for filter bars that float over content. Selected segment: a glass **lens** (`glass.selection` fill) with a **1.5 pt glass-accent outline** (≥ 3:1 against the track in both themes, §1.4), radius 10, label `subhead` 600 `textPrimary`, and a leading `check` 16 for **every** option count. Unselected: transparent with a transparent 1.5 pt border (no layout shift), glass `textSecondary` 500. Segments size to their labels (`flexBasis auto`) so "Completed" is never cut to "Complet…". Two to four segments; five or more becomes Tabs or a picker sheet. Role `radiogroup` / `radio` with `checked` (and `aria-checked` on web). Used for: theme (Light · Dark · System), toss decision (Bat · Bowl), extras type (Wide · No ball · Bye · Leg bye · Other: five items, so that one is Tabs), dot style, history (Matches · Tournaments).

### 6.8 BottomSheet

| Part | Spec |
|---|---|
| Container | `sheet` glass (88% light / 82% dark tint over the blur, sheen in light, rim, 1 px cyan edge in light), top corners radius 24, max height 90% of the window; scoring sheets size to their content. Content inside (rows, fields, chips) keeps its own solid surfaces, raised one step (`SurfaceLevelScope level="raised"` → `useContentSurface()` = `surfaceElevated`) so grouped rows stand apart from the dark sheet |
| Presentation | `sheetPresentation(width, height)`: phones (< 600) get the bottom sheet; portrait tablets and other widths up to landscape tablets get a **floating** sheet, max width 560, centred, every corner radius 24, 16 above the safe area, with the glass lift; landscape windows ≥ 768 wide get a **side sheet** on the right edge, 420 wide, full height inside 16 margins, sliding in from the right (no swipe-to-dismiss there) |
| Grabber | 36 × 4, radius 2, `borderStrong`, 8 from top (decorative, hidden from accessibility) |
| Header | 56: title `headline` left, optional subtitle `footnote`, close `IconButton` (`x`) right |
| Body | padding 16; scrolls inside when content exceeds the height |
| Footer | optional sticky action row (primary/secondary `lg`), hairline top border |
| Scrim | `glass.scrim.color` (denser `glass.scrim.reduced` when transparency is reduced); a tap dismisses non-blocking sheets |
| Dismiss | Close button, scrim tap, Android back, swipe down more than 30% of the height. **Blocking** sheets (pending actions: next batter, next bowler, start innings, confirm result, resolve tie) cannot be swiped or scrim-dismissed; they offer "Undo last ball" instead |
| Implementation | RN `Modal` (transparent) + reanimated + `PanResponder`, with `GlassMaterial level="sheet"` as the background layer; no extra library |
| Accessibility | `accessibilityViewIsModal`, focus moves to the title on open and returns to the invoking control on close |

### 6.9 Dialog

Centered, width min(400, screen − 48), radius 22, padding 24, `sheet` glass with the glass lift in light, over the glass scrim. Title `title2`, body `body` `textSecondary`, optional content (reason TextField, typed-name field). Actions: right-aligned row (secondary then primary) at 48 height; stacked full width when any label is longer than 18 characters or the font scale is above 1.3. A destructive dialog uses `destructiveConfirm` as its primary action and puts **Cancel on the left, with initial focus on Cancel**. Used for: DISCARD match, delete, "Current pool arrangement will be replaced.", reason entry, stale preview (`CONFLICT`).

### 6.10 Toast

One toast at a time (the queue lives in `useToastStore`, rendered by the root `ToastHost`). Placement comes from the **toast anchor** of the screen in front (`ToastAnchorProvider` in the root layout): 16 above the floating tab bar (`TabChrome`) or above a `Screen` footer or dock, and 16 above the home indicator otherwise. **On the live scoring screen the screen registers a top anchor (`useToastAnchor({ edge: 'top', offset })`) just under the score band, so the toast never covers the pad.** The toast is `popover` glass: radius 16, padding 12 × 16, min height 48, the glass lift in light, the coloured rim in dark. The leading icon 20 by kind (`circle-check`, `info`, `triangle-alert`, `circle-alert`) and the `subhead` message are both `textPrimary`; the optional action is a tertiary button (`Undo`, `Redo`, `Try again`) in `accent` (worst case 6.88:1 light, 5.62:1 dark). Duration: info/success 4 s, with an action 6 s, error stays until dismissed or acted on. Announced as a polite live region (errors assertive).

### 6.11 TextField

Label above (`subhead`, `textSecondary`, 8 gap), field height 48, padding x 12, `surface`, 1 `borderStrong`, radius 6, text `body` `textPrimary`, placeholder `textMuted`. Focus: 2 `accent` border (no glow). Error: 2 `danger` border, `circle-alert` 16 plus the message `footnote` `danger` below. Helper: `footnote` `textMuted` below. Numeric variant: `keyboardType="number-pad"`, text right-aligned `tableNumeric` for overs/runs/seed. Multiline variant (reason, notes): min 96 tall. The "Reason" field used by confirm flows shows "Required for completed matches" as helper text when required.

### 6.12 Stepper

`caption … [−] value [+]`: the `label` is **always visible** as a `body` caption on the left (optional `caption` second line in `footnote`; `hideLabel` only where the screen already names the stepper next to it), hidden from the reader because the adjustable control already carries it; controls on the right. Buttons 44 × 44 (radius 6, icons `minus`/`plus` 20, 1 pt `borderStrong` outline on transparent; at a bound the button keeps a quiet `border` outline, never a filled block); value `scoreMedium`-style Barlow Condensed 600 24, tabular, min width 56, centered. Tapping the value opens a numeric TextField in place. Long-press repeats after 400 ms every 100 ms (a convenience; plain taps work). At a bound the button is disabled. Accessibility role `adjustable` with increment/decrement actions and a label like "Overs, 20". Used for: custom overs, players per side, balls per over, custom extras runs, pool count, legs.

### 6.13 ListRow

Min height 56 (48 for single-line settings rows). Padding x 16, y 12. Slots: leading (icon 20 `textSecondary`, or a team-code `Monogram`: min 40 × 32, grows with the code, 6 pt padding, radius 6, `accentSubtle` fill with the code in `accent` Barlow Condensed `figureSmall`, so "WFW" never overflows and the dark badge is never a near-black hole), title `body`, optional subtitle `footnote` `textSecondary` (max 2 lines), trailing (value `body` `textSecondary` / `chevron-right` / Switch / Badge / `ellipsis` IconButton). Pressed: `surfaceSunken`. The row, its trailing menu cell and the line behind them share one surface (`useContentSurface()`). Separator: hairline, snapped, inset 16 for every row. The whole row is one accessible element; the trailing menu is a separate button with a label ("More actions for Lions v Tigers").

### 6.14 SectionHeader

`label` style (UPPERCASE 12/16, +0.8, `textSecondary`), padding top 24, bottom 8, x 16. Optional trailing `tertiary sm` action ("See all", "Full table"). Variant `ruled` draws the boundary rule above, for top-level sections of Home, the dashboard and the scorecard. Role `header`.

### 6.15 EmptyState

No illustrations. Layout: top offset 40, optional lucide icon 32 `textMuted`, title `title2` `textPrimary` (one line), body `body` `textSecondary` (max 3 lines, max width 320, centered), primary Button `md` below at 24 gap. Copy is purposeful (§87), for example "No tournaments yet" / "Create a tournament and manage teams, fixtures, standings and finals in one place." / `CREATE TOURNAMENT`. The copy for every screen is in WIREFRAMES.md.

### 6.16 ErrorState and error banner

Full-screen ErrorState: icon `circle-alert` 32 `danger`, title "Couldn't load this tournament", body "Your data is safe on this device. Try again, or open Diagnostics for details.", buttons [Try again] (primary) [Diagnostics] (tertiary). **Never shows the raw error** (§86). `ServiceError.message` is already human-readable; `detail` goes to Diagnostics only.

Inline banner (for example needsRepair, `integrityIssues`): full-bleed, `dangerSubtle` background (or `warningSubtle` for advisories), 3 px leading bar in `danger`/`warning`, icon plus `subhead` text plus an optional tertiary action. There is no close button for danger banners.

### 6.17 Skeleton

Blocks in `surfaceSunken`, radius 2, matching the final layout (row heights, text line widths 60%/40%). **Shown only if loading exceeds 300 ms** (SQLite reads are usually faster, so this prevents a flash). Animation: opacity 1 → 0.55 → 1 over 1200 ms, looping. With reduced motion the blocks are static. Accessibility: the container is announced once as "Loading" (`accessibilityState.busy`).

### 6.18 Badge / StatusLabel

Height 24, padding x 8, radius 2, `label`-size text (12, 600, sentence case, no uppercase inside tables). Every badge has text; icons are optional.

| Badge | Background | Text | Icon |
|---|---|---|---|
| Live | `accentSubtle` | `accent` "Live" | 6 px filled `accent` dot (static, no pulse) |
| Paused | `warningSubtle` | `warning` "Paused" | `pause` |
| Scheduled / Postponed / Cancelled | none, 1 `borderStrong` | `textSecondary` | none |
| Completed / Tied / No Result / Walkover / Abandoned | none | `textSecondary` text only | none |
| Qualified | `successSubtle` | `success` "Qualified" | `check` |
| In contention | none, 1 `borderStrong` | `textSecondary` "In contention" | none |
| Eliminated | none | `textMuted` "Eliminated" | `x` |
| Provisional | none, 1 dashed `borderStrong` | `textSecondary` "Provisional" | none |
| Manual Override (§47) | `warningSubtle` | `warning` "Manual Override" | `pencil-line` |
| Needs repair | `dangerSubtle` | `danger` "Needs repair" | `circle-alert` |

Status text comes from `matchStatusLabel` / `TeamQualification.state`. The UI maps codes to strings; it never reinterprets them.

### 6.19 Switch

`Switch` (`src/ui/primitives/Switch.tsx`) wraps the platform switch with token colours from `switchColors(theme)`: light track on `accent` with a `surface` (white) knob (7.2:1), dark track on `accentDeep` with an `inverseSurface` knob; off track `borderStrong` in both, knob ≥ 3:1 against every track; disabled uses the quiet `surfaceSunken`/`surfaceElevated` track. `thumbColor`, `ios_backgroundColor` and the web `activeThumbColor`/`activeTrackColor` are all set, so the Material default `#009688` never appears. It always sits in a ListRow whose title names the setting. The row is the accessible element (role `switch`, `checked`).

### 6.19a Selection controls: ChoiceList, Chip, ChipGroup, OptionTile (§78)

One selected treatment everywhere, never colour alone: **a mark (radio dot or check), a heavier label, and an accent outline**, plus `checked` (and `aria-checked` on web).

| Primitive | Single choice | Multi choice |
|---|---|---|
| `ChoiceList` | `radiogroup` of `radio` rows (min 56): a 22 pt ring (2 pt `borderStrong`, `accent` when selected) with a 10 pt filled dot, label 600 when selected | `mode="multi"`: `checkbox` rows with a 22 pt square that fills `accent` with an `onAccent` check |
| `Chip` / `ChipGroup` | 40 tall (44 with hit slop), pill, 1 pt `borderStrong`; selected: leading `check` 16, label 600, 2 pt `accent` outline on `accentSubtle`. `scroll` puts a long row in a `ScrollRow` with edge fades that keeps the selected chip in view | same, role `checkbox` |
| `OptionTile` | Card tile (radius 8): title, description, a trailing radio mark; selected adds the 2 pt `accent` outline on `accentSubtle`. Replaces the "SELECTED" word inside tiles | `kind="checkbox"` |

Single-choice lists (outcome, override type, stage, pool, venue, hypothetical result) must use single mode: square checkboxes there tell users several items can be picked.

### 6.20 Glass components (§106)

Everything glass is built from `src/ui/glass`; `expo-glass-effect` and `expo-blur` are imported nowhere else (enforced by `src/__tests__/codeRules.test.ts`), so the platform resolver and Reduce Transparency always apply. The feature-team API, with code, is in `.workflow/wave3/glass-foundation.md`.

| Component | What it is | Key props |
|---|---|---|
| `GlassSurface` | A view whose background is glass at a level. iOS 26: `GlassView`; elsewhere `GlassMaterial` under the children; opaque twin when transparency is reduced. Children on `bar`/`dock`/`control` get the glass inks (§1.4) | `level`, `radius`, `corners` (`all`/`top`/`bottom`), `rim` (`all`/`top`/`bottom`/`none`), `sheen`, `blur`, `active` (strengthens the material), `rest` (strength while inactive, 0–1), `elevated` (glass lift while active), `interactive` (iOS 26 touch response) |
| `GlassMaterial` | The material alone, absolutely filling its parent and hidden from assistive technology, for parents that animate themselves (Sheet, Dialog, Toast) | same material props |
| `GlassBar` | Top bar: `bar` glass, bottom rim/edge, safe-area top padding, resting at `glass.rest` and full once `scrolled` (with the lift in light) | `scrolled`, `safeArea`, `floating`, `rest` |
| `GlassDock` | Bottom dock: `dock` glass, 24 pt top corners, lit top rim, safe-area bottom padding | `safeArea`, `floating`, `offset`, `rounded` |
| `GlassGroup` | Lets neighbouring glass merge and morph on iOS 26 (`GlassContainer`); a plain view elsewhere | `spacing` |
| `AmbientBackground` | The §107 page atmosphere: two very large, very soft radial glows (`react-native-svg`, eased six-stop falloff, §1.4). Kept under Reduce Transparency (it is light, not glass); removed under the system high-contrast setting. `AMBIENT_GLOWS`, `AMBIENT_FALLOFF` and `ambientStops()` expose the geometry | – |
| `Screen` | Page frame that wires it all: the §107 ambient atmosphere behind **every** screen (opt out with `flat`; removed under high contrast), `header` in a floating `GlassBar` with an 8 pt bottom gap so scrolled content visibly passes under the frost, `footer` in a floating `GlassDock` (`footerPadding="flush"` for a scoring pad), status-bar glass on scroll, content insets, toast anchor. The old `ambient` prop is accepted and ignored | `header`, `footer`, `footerPadding`, `scroll`, `flat`, `barTitle` |
| Insets | `useContentInsets()` (safe area + chrome above/below), `useChromeInsets()`, `useScreenList()` (padding, indicator insets and the glass scroll handler for a FlatList inside a non-scrolling `Screen`), `ChromeInsetsProvider` | – |
| Toast anchor | `ToastAnchorProvider` (root), `useToastAnchor({ edge, offset })` | – |
| `EdgeFades` | The overflow affordance for horizontal rows (`ScrollRow`, `Tabs`, split `Table`): a fade to the row's background and a 16 pt chevron on each side that has more content | `overflow`, `color` |
| Built-in users | `TabBar` (docked surface with the liquid droplet, §6.6), `Tabs`, `SegmentedControl`, `FloatingActionButton` (pill `bar` glass, rides above the tab bar through `useContentInsets`; `collapsed` makes it a 56 pt icon-only circle on short screens), `Sheet`, `Dialog`, `Toast` | – |

**Scroll-under behaviour.** Top bars rest as glass at 60% (tint, sheen and bottom rim visible on the ambient page) and strengthen to full glass (`motion.fast`, instant when motion is reduced; on iOS 26 the native glass is always on) once the content has scrolled more than 2 pt beneath them. Screens without a header keep a clear status-bar strip at rest (`rest={0}`, iOS large-title style) that turns to glass on scroll, optionally with a centred `barTitle`.

**Focus rings.** Every primitive draws its 2 pt `focusRing` outline only for keyboard or switch-access focus. The shared `useFocusRing()` tracks the input modality: on web from keydown versus pointerdown (document capture phase); natively from touches seen by `InputModalityRoot` at the app root. A focus that follows a touch (for example Android restoring focus to a row after a sheet closes) draws no ring; a run of two focus moves without a touch switches back to keyboard modality. A ring that is showing disappears as soon as the screen is touched, so a tapped key, tab, row or button never looks armed or selected.

---

## 7. Live-scoring composition (summary)

The authoritative layout is in WIREFRAMES.md §W-S1. Hierarchy per §73, top to bottom:

The top bar and the **live score band** float in a `GlassBar`; the **scoring dock** (action row + pad) floats in a `GlassDock`; the batters, bowler and over strip scroll between them on the solid page (`Screen scroll={false} header={…} footer={…} footerPadding="flush"`, with the middle region using `useScreenList()`). The keys keep solid faces on the dock, and the screen registers a top toast anchor under the score band.

1. **Score**: `scoreHero` in `score` colour, with the batting team `headline` above it. On the score band glass, `score`, `textPrimary`, `textSecondary` and `accent` are the allowed inks (`GLASS_INKS.bar`); `textMuted` moves to `textSecondary` there.
2. **Current over**: `scoreLarge` `16.4` plus `footnote` "ov" / "of 20", on the same baseline as the score, right-aligned.
3. **Striker / non-striker**: two 44-tall rows (name `bodyStrong`, runs `figure`, balls `subhead` `textSecondary` in parentheses); striker marked by ▶ plus `accentSubtle` plus a leading bar.
4. **Bowler**: one 44-tall row, `circle-dot` marker, figures `figure` (`3.4-0-28-2`), `ECO 7.63` `subhead`.
5. **Current ball sequence**: OverStrip.
6. **Scoring controls**: the 8-key pad, anchored to the bottom safe area.
7. **Secondary actions**: a 48-tall action row directly above the pad (Undo · Redo when available · Swap strike · More). Rates and chase lines sit under the score in `subhead`, not competing with it.

Pending actions (`select_next_batter`, `select_next_bowler`, `start_next_innings`, `resume_play`, `confirm_result`, `resolve_tie`) show as a **blocking bottom panel that replaces the pad area**. The score stays visible above it.

---

## 8. Motion (§75)

The feel is subtle and precise, like a broadcast graphic, never a game show. Implemented with `react-native-reanimated` (worklets on the UI thread). No spring overshoot anywhere.

| Token | Duration | Easing |
|---|---|---|
| `motion.instant` | 0 ms | – |
| `motion.fast` | 120 ms | `Easing.out(Easing.cubic)` |
| `motion.base` | 200 ms | `Easing.bezier(0.2, 0, 0, 1)` (standard) |
| `motion.slow` | 320 ms | `Easing.bezier(0.2, 0, 0, 1)` |
| `motion.exit` | 160 ms | `Easing.bezier(0.3, 0, 1, 1)` |

| Moment | Default | Reduced motion |
|---|---|---|
| **Score change** (any run) | Only the changed digits roll vertically: outgoing moves −8 px and fades, incoming +8 → 0 and fades in, `motion.base`. Tabular digits keep the width constant | Instant text swap |
| **Dot / 1 / 2 / 3** | New chip fades in (opacity 0 → 1, `motion.fast`); the placeholder it replaces is removed | Instant |
| **Four** (small confirmation) | Chip enters with scale 0.85 → 1 over `motion.base`; the chip's 2 px accent ring draws once as an expanding outline (1 → 1.25, opacity 0.6 → 0) over 240 ms | Chip appears instantly; no ring |
| **Six** (slightly stronger) | Same entry as four; the ring expands 1 → 1.4 over 320 ms; the score figure's **new digits** show in `accent` for 400 ms, then return to `score` over `motion.base`. Never the bright `highlight`: a six is routine, not an alert | Instant chip; accent tint on digits held for 400 ms, then swapped back without a fade |
| **Wicket** (brief) | The wickets digit rolls; a 2 px `danger` rule draws left → right under the score block (`motion.slow`), holds 300 ms, then fades (`motion.exit`); the W chip enters with scale 0.85 → 1 | The danger rule appears and disappears (no draw); chip instant |
| **End of over** (smooth) | The strip slides left by its width while the next (empty) strip slides in, `motion.slow`. The finished over collapses into a one-line summary "Over 17 · 9 runs · Hassan" that stays in the strip header until the next delivery | Crossfade 120 ms |
| **Innings complete / pending panel** | The panel slides up from the pad area, `motion.base`; the pad fades out behind it | Crossfade 120 ms |
| **Result** (refined) | The result line fades in and rises 8 px (`motion.slow`) after a 120 ms delay; the boundary rule under it draws left → right over 320 ms. Nothing else moves | Instant |
| **Sheets** | Open: translateY 100% → 0, `motion.base`; close: `motion.exit`. Scrim fades with them | Opacity only, 120 ms |
| **Dialog** | Fade + scale 0.98 → 1, `motion.fast` | Fade only |
| **Toast** | Fade + translateY 8 → 0, `motion.fast` | Fade only |
| **Tab / screen transitions** | Platform native-stack defaults | Native stack with `animation: 'none'` |
| **Tab bar liquid** | Leading end 300 ms ease-out, trailing end 460 ms ease-in-out, no overshoot (§6.6) | The droplet jumps to the new tab |
| **Glass under scroll** | Top-bar material fades in over `motion.fast`; iOS 26 glass animates its style change (0.2 s) | Instant switch, no animation |
| **Glass touch (iOS 26)** | Interactive glass on the FAB responds to touch (the native highlight and flex) | `isInteractive` off: no morphing or highlight |
| **Skeleton** | Opacity pulse, 1200 ms | Static |

Rules:
- Animations never delay input. The next tap is accepted immediately, and a running animation jumps to its end state when a new ball arrives.
- Nothing loops on the live screen: no pulsing "live" dots, no breathing buttons.
- Reduced motion is `settings.reducedMotion === 'on'`, or `'system'` with `AccessibilityInfo.isReduceMotionEnabled()` true (subscribe to `reduceMotionChanged`). The theme exposes `motion.reduced: boolean`.

---

## 9. Haptics (§76) and sound (§77)

Haptics use `expo-haptics`, fire **after the service commits** (never on press-in, so a failed save does not "feel" successful), and only when `settings.hapticsEnabled`. The adapter lives in `src/services` (ARCHITECTURE §6) and is called by the store after a successful commit.

| Event | Call |
|---|---|
| Dot ball | none |
| 1 / 2 / 3 / 5 runs, byes, leg byes, wide, no-ball (without boundary) | `impactAsync(ImpactFeedbackStyle.Light)` |
| Four (incl. NB + 4, 4 byes, wide to the boundary) | `impactAsync(ImpactFeedbackStyle.Medium)` |
| Six (incl. NB + 6) | `impactAsync(Medium)`, then 80 ms later `impactAsync(Light)`: "slightly stronger" without being a different class |
| Wicket (delivery, off-ball, retired out) | `impactAsync(ImpactFeedbackStyle.Heavy)` |
| End of over (bowler prompt appears) | `selectionAsync()` |
| Match result confirmed (`match_ended`) | `notificationAsync(NotificationFeedbackType.Success)` (distinctive) |
| Undo / redo committed | `selectionAsync()` |
| Save failed / validation refused (toast error) | `notificationAsync(NotificationFeedbackType.Error)` |
| Impact preview "Continue" applied | `notificationAsync(Success)` |
| Picker selections, toggles, tab changes | none (to avoid noise) |

The tier comes from the committed event's `BallToken.kind` and `isFour`/`isSix` on the new `BallRecord`, so the UI does no cricket maths. `hapticsEnabled` is controlled in Settings → Feedback → "Vibration" (§77 names it "Vibration ON/OFF").

**Sound (§77):** the settings row "Sound effects" maps to `soundEnabled`. The spec asks for bundled local sounds, but **no audio library is installed** (neither `expo-audio` nor `expo-av` is in `package.json`). V1 ships the setting disabled with the subtitle "Not available in this version" and no sound assets, and this is reported as a dependency gap. When a player is added, the sound map mirrors the haptics table: run tick / boundary knock / wicket stump / result chord, each ≤ 300 ms and ≤ −12 dBFS.

---

## 10. Implementation checklist for `src/ui`

- `theme/tokens.ts`: `lightColors`, `darkColors` (every key in §1.1 and §1.2), `space`, `radius`, `border`, `elevation`, `motion`. With `theme/glass.ts` (`lightGlass`, `darkGlass`, `GLASS_INKS`, `glassRadius`, `glassRimFor`, the blur-aware contrast model, §1.4), these are the **only** files with colour literals (plus the print palette in `src/export/pdf/styles.ts`).
- `glass/*`: `GlassSurface`, `GlassMaterial`, `GlassBar`, `GlassDock`, `GlassGroup`, `GlassBackdrop`, `AmbientBackground`, the renderer resolver (`useGlassRenderer`), the content-inset hooks, and a test seam (`glass/testing`: `setLiquidGlassAvailable`) for the iOS 26 path. The only place `expo-glass-effect` and `expo-blur` are imported.
- `theme/ThemeProvider.tsx`: resolves `ThemePreference` (`system` uses `useColorScheme()`), the reduced-motion preference and Reduce Transparency (in-app `settings.reduceTransparency` OR the system setting: iOS `isReduceTransparencyEnabled`, web `prefers-reduced-transparency`); exposes `useTheme()`, `useGlass()`. Switching theme re-renders without remounting screens.
- `typography/Text.tsx`: `<Text variant>` with the table in §2. Numeric variants set `fontVariant: ['tabular-nums']` and per-variant `maxFontSizeMultiplier` (RESPONSIVE.md §5).
- `primitives/*`: every component in §6, with RNTL tests for role, label, disabled/selected state, and hit size ≥ 44.
- `scoreboard/*`: `ScoreFigure`, `BallChip`, `OverStrip`, `StatLine` (batter/bowler row), `ScoreKey`, `ScoringPad`.
- `charts/*`: `WormChart`, `ManhattanChart`, `PartnershipBars` over `react-native-gifted-charts`, themed per THEMES.md §4.
- The grep test "no hex outside `src/ui/theme`" covers `src/features` and `src/app`.
