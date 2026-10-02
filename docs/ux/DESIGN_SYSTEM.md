# Scorebook — Design System

Spec: §1, §67–§78, §101, **§106 (liquid glass amendment)**. Implemented by **WP-design-system** in `src/ui/**` (tokens in `src/ui/theme`, glass material in `src/ui/glass`, text styles in `src/ui/typography`, primitives in `src/ui/primitives`, scoreboard parts in `src/ui/scoreboard`, charts in `src/ui/charts`). Companion docs: [THEMES.md](THEMES.md) (per-component colour mapping, charts, PDF), [RESPONSIVE.md](RESPONSIVE.md), [ACCESSIBILITY.md](ACCESSIBILITY.md), [WIREFRAMES.md](WIREFRAMES.md).

Every value in this document is a contract for `src/ui`. Feature code never uses a hex literal, a raw number for spacing, or a font name. It uses `theme.color.*`, `theme.space.*`, `theme.radius.*` and `<Text variant="…">`.

---

## 0. Identity: a modern cricket scorebook

The product should look like a well-kept scorebook set in a sports-broadcast typeface. It is information design, not decoration (§1, §101). Since §106 the **floating control and navigation layer** is made of liquid glass: the scorebook page stays calm and solid, and the chrome that floats above it (tab bar, top bars, sheets, dialogs, toasts, menus, segmented and filter bars, the scoring dock, floating buttons, the live score band) is a translucent, frosted material that lets the page show through (§1.4).

| Do | Don't (§1) |
|---|---|
| Hierarchy comes from type size and weight. Numbers are the heroes. | Card per statistic, "dashboard tiles", KPI boxes |
| Full-bleed rows separated by hairlines, as on a scorebook page | Rounded cards floating on a grey canvas |
| Sections separated by the **boundary rule**: a 2 px rule, 2 px gap, 1 px rule, like the heavy ruling between innings in a printed scorebook | Gradients, glass, glow, neon, drop shadows **on content** (tables, lists, forms, rows) |
| Liquid glass on the floating chrome only, built from `src/ui/glass` (§1.4, §106) | Glass on content, glass behind dense numbers, raw `GlassView`/`BlurView`/gradients in feature code |
| Condensed numerals (Barlow Condensed) for the score, overs and figures, as on a ground scoreboard | Giant icons, illustrations, stadium photos, grass, bats or balls |
| Restrained marks for events: circle, outline, fill, square. Each is paired with its text label | Colour-only states, confetti, game-show animation |
| One accent (cricket green `#1F5C3A`, already the app icon/splash colour in `app.json`) | Multi-colour palettes, accent on every element |

Cricket details are allowed only when they carry information:
- **Score notation**: `142/4`, overs `16.4`, figures `3.4-0-28-2`.
- **Over indicator**: the current-over strip shows one empty placeholder circle for each legal ball still due in the over.
- **Scorebook grid**: the ball-by-ball log lays each over out as a row of ball cells, like the bowling-analysis boxes in a paper book.
- **Boundary rule** between major sections.
- **Stumps glyph** on the WICKET key: three vertical strokes plus a bail, drawn in `react-native-svg` at 20 px. It is the only custom icon.

---

## 1. Colour tokens (§68, §69, §71)

The §71 tokens are mandatory. The extended tokens complete the system and use the same naming rules. Light and dark were designed separately (see THEMES.md for the rationale), and dark is not an inversion of light.

### 1.1 Core tokens (§71)

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F5F3EC` warm off-white (paper) | `#111412` deep charcoal, green undertone | Screen canvas |
| `surface` | `#FFFFFF` | `#181C19` | Rows, tables, inputs, scoring keys, the selected segment lens |
| `surfaceElevated` | `#FFFFFF` (plus elevation 1) | `#212622` (tone step, no shadow) | Solid raised content such as chart callouts. Sheets, dialogs, menus and toasts are glass since §106 (§1.4) |
| `textPrimary` | `#1A1C19` charcoal | `#ECEEE9` | Body text, names, table values |
| `textSecondary` | `#474E49` muted slate | `#B4BBB4` | Supporting lines, column headers, unselected tabs |
| `textMuted` | `#646A65` | `#8E968F` | Metadata (dates, "16.4 ov" suffix), dot balls, placeholders |
| `border` | `#DDD9CE` | `#2B312D` | Hairline separators (decorative, not an affordance) |
| `accent` | `#1F5C3A` cricket green | `#72BE90` restrained green | Primary buttons, selection, links, striker marker, focus |
| `success` | `#276A3E` | `#7CC49A` | "Qualified", completed/saved confirmations |
| `warning` | `#8A5300` | `#E3B55E` | Advisory banners (retirement due, uneven pools, provisional), "Manual Override" |
| `danger` | `#B3261E` | `#EE8A7F` | Wicket, destructive actions, errors |
| `score` | `#111310` | `#F6F7F3` | The live score figure and score keys only (the highest-contrast ink) |

### 1.2 Extended tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `surfaceSunken` | `#ECE9E0` | `#0B0D0C` | Scoring pad well outside the glass dock (edit ball), skeleton blocks, pressed rows |
| `borderStrong` | `#8A877C` | `#646E66` | Input outlines, secondary buttons, ball-chip outlines (these are affordances, so ≥ 3:1) |
| `accentPressed` | `#174A2D` | `#5FA87C` | Pressed primary button |
| `accentSubtle` | `#E2ECE4` | `#1C3326` | Selected row/segment tint, current batter row, pressed run key |
| `onAccent` | `#FFFFFF` | `#0A1A10` | Text/icons on `accent` fills |
| `successSubtle` | `#E3EFE6` | `#1A3023` | Qualified badge background |
| `warningSubtle` | `#FAEFD9` | `#33291A` | Advisory banner background, Manual Override badge |
| `dangerSubtle` | `#FBE8E6` | `#3A1E1B` | Pressed WICKET key, error banner background |
| `onDanger` | `#FFFFFF` | `#240907` | Text on `danger` fills (the W ball chip, the destructive confirm button) |
| `focusRing` | `#1F5C3A` | `#9AD3AF` | 2 px keyboard/switch-access focus outline |
| `scrim` | `rgba(17,19,16,0.40)` | `rgba(0,0,0,0.60)` | Legacy solid scrim. Sheets and dialogs use `glass.scrim` (§1.4) |
| `inverseSurface` | `#1A1C19` | `#ECEEE9` | Reserved (the pre-§106 light toast). Toasts are `popover` glass now |
| `inverseText` | `#F5F3EC` | `#111412` | Toast text on `inverseSurface` |
| `inverseAccent` | `#9AD3AF` | `#72BE90` | Reserved, paired with `inverseSurface` |
| `chartSeries1` | `#2A7F50` | `#55A877` | Team batting first / innings 1 (THEMES.md §4) |
| `chartSeries2` | `#4A6FC0` | `#7792DA` | Team batting second / innings 2 |
| `chartGrid` | `#E7E4DA` | `#252A26` | Chart gridlines |

Rule: status colours (`success`, `warning`, `danger`) are never used as chart series or decoration. `accent` is never used for an error.

### 1.3 Verified contrast (WCAG 2.2, relative luminance)

Computed with the WCAG formula for every text/background pairing the components use. WP-design-system's acceptance test recomputes them from `src/ui/theme` (≥ 4.5:1 for text, ≥ 3:1 for large text ≥ 24 px regular / 18.66 px bold and for UI component boundaries).

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| `textPrimary` / `background` | **15.45** | **15.87** | 4.5 (AAA 7) |
| `textPrimary` / `surface` | 17.16 | 14.74 | 4.5 |
| `textPrimary` / `surfaceElevated` | 17.16 | 13.17 | 4.5 |
| `textPrimary` / `surfaceSunken` | 14.13 | 16.69 | 4.5 |
| `textSecondary` / `background` | 7.71 | 9.45 | 4.5 |
| `textSecondary` / `surface` | 8.56 | 8.78 | 4.5 |
| `textSecondary` / `surfaceElevated` | 8.56 | 7.84 | 4.5 |
| `textMuted` / `background` | 4.99 | 6.10 | 4.5 |
| `textMuted` / `surface` | 5.54 | 5.67 | 4.5 |
| `textMuted` / `surfaceElevated` | 5.54 | 5.06 | 4.5 |
| `textMuted` / `surfaceSunken` | 4.56 | 6.41 | 4.5 |
| `score` / `background` | 16.82 | 17.23 | 3 (large) |
| `score` / `surface` | 18.68 | 16.01 | 3 (large) |
| `accent` / `background` (links, selected text) | 7.14 | 8.37 | 4.5 |
| `accent` / `surface` | 7.92 | 7.78 | 4.5 |
| `accent` / `surfaceElevated` | 7.92 | 6.95 | 4.5 |
| `accent` / `accentSubtle` (selected segment label) | 6.55 | 6.11 | 4.5 |
| `onAccent` / `accent` (primary button) | 7.92 | 8.12 | 4.5 |
| `onAccent` / `accentPressed` | 10.22 | 6.32 | 4.5 |
| `textPrimary` / `accentSubtle` (current batter row) | 14.18 | 11.59 | 4.5 |
| `success` / `surface` | 6.53 | 8.38 | 4.5 |
| `success` / `successSubtle` | 5.52 | 6.85 | 4.5 |
| `warning` / `surface` | 6.33 | 9.05 | 4.5 |
| `warning` / `warningSubtle` | 5.55 | 7.49 | 4.5 |
| `danger` / `surface` | 6.54 | 7.04 | 4.5 |
| `danger` / `background` | 5.89 | 7.57 | 4.5 |
| `danger` / `dangerSubtle` | 5.54 | 6.21 | 4.5 |
| `onDanger` / `danger` (W chip) | 6.54 | 7.68 | 4.5 |
| `textPrimary` / `warningSubtle` (banner body) | 15.04 | 12.20 | 4.5 |
| `textPrimary` / `dangerSubtle` | 14.53 | 13.01 | 4.5 |
| `borderStrong` / `surface` (input outline) | 3.60 | 3.25 | 3 (non-text) |
| `borderStrong` / `background` | 3.24 | 3.50 | 3 (non-text) |
| `focusRing` / `background` | 7.14 | 10.87 | 3 (non-text) |
| `focusRing` / `surface` | 7.92 | 10.10 | 3 (non-text) |
| `border` / `surface` | 1.41 | 1.30 | none: decorative separator only; never the only boundary of a control |
| `inverseText` / `inverseSurface` (toast) | 15.45 | – | 4.5 |
| `inverseAccent` / `inverseSurface` (toast action) | 10.06 | 6.95 (on `surfaceElevated`) | 4.5 |
| `chartSeries1` / `surface` | 4.94 | 5.95 | 3 (graphical object) |
| `chartSeries2` / `surface` | 4.85 | 5.67 | 3 (graphical object) |
| `chartSeries1` / `background` | 4.45 | 6.40 | 3 (graphical object) |
| `chartSeries2` / `background` | 4.37 | 6.10 | 3 (graphical object) |

The chart pair also passes the dataviz palette validator's checks (lightness band, chroma floor, colour-vision separation, normal-vision floor): colour-vision ΔE 17.8 in light and 15.3 in dark. Series text never uses these colours (THEMES.md §4).

Every text token reaches **≥ 4.5:1 on every surface it is placed on, in both themes**. That includes `textMuted`, so there are no low-contrast labels outdoors (§72). Disabled controls are the only exception. They are exempt under WCAG, and they are marked by a "disabled" accessibility state and never carry information.

### 1.4 Glass material (§106)

Glass is a **material**, not a colour: a frosted blur of whatever scrolls behind it, a tint, a rim highlight on the edge that catches the light, and a soft specular sheen at the top. The tokens live in `src/ui/theme/glass.ts` (`lightGlass`, `darkGlass`, exposed as `theme.glass` / `useGlass()`), the only other file besides `tokens.ts` allowed to contain colour literals. Feature code never sees these values; it uses the `src/ui/glass` components (§6.20).

**Where glass is used (and where it is not).** Glass belongs to the floating control and navigation layer: the tab bar, top bars once content scrolls under them, bottom sheets, dialogs, toasts, menus (they are sheets), segmented controls and filter/tab bars, the live-scoring dock that holds the pad and its action row, floating action buttons and the live score band. Tables, long lists, form fields, rows and any text-dense content stay on `background`/`surface`. Scoring keys keep their solid `surface` faces: the dock around them is glass, the keys are not.

#### Elevation levels

Each level has a translucent **tint**, an **opaque twin** with the same RGB (used when transparency is reduced), a **blur** intensity (expo-blur 1–100) and whether it carries the **sheen**. Tints are deliberately dense: the material reads as glass from the blur, rim and sheen, while the tint opacity is what keeps text legible over the worst content behind it.

| Level | Used by | Light tint / opaque | Dark tint / opaque | Blur | Sheen L / D |
|---|---|---|---|---|---|
| `bar` | Tab bar capsule, top bars, top tabs, FAB | `rgba(251,251,248,0.80)` / `#FBFBF8` | `rgba(18,26,28,0.88)` / `#121A1C` | 60 | yes / yes |
| `dock` | Scoring dock, sticky footers | `rgba(251,251,248,0.84)` / `#FBFBF8` | `rgba(18,26,28,0.88)` / `#121A1C` | 60 | yes / yes |
| `control` | Segmented-control track | `rgba(232,229,220,0.84)` / `#E8E5DC` | `rgba(8,12,13,0.84)` / `#080C0D` | 40 | yes / yes |
| `popover` | Toasts, popovers | `rgba(251,251,248,0.90)` / `#FBFBF8` | `rgba(22,31,34,0.90)` / `#161F22` | 50 | yes / no |
| `sheet` | Bottom sheets, dialogs (near-solid: they hold forms and lists) | `rgba(251,251,248,0.94)` / `#FBFBF8` | `rgba(20,27,30,0.95)` / `#141B1E` | 70 | yes / no |

Light glass is a pale, warm white that blends into the paper background without harsh blocks. Dark glass is a deep charcoal with a teal-navy cast (blue channel above red, never transparent black), so it separates from the green-charcoal page instead of looking muddy.

#### Edges, sheen, selection and wash

| Token | Light | Dark | Use |
|---|---|---|---|
| `rim.color` / `rim.top` (1 pt) | `rgba(255,255,255,0.55)` / `rgba(255,255,255,0.90)` | `rgba(120,196,196,0.20)` / `rgba(140,214,210,0.38)` | Rim highlight; the top edge is lit more, like light catching a glass edge. Dark rims are a soft teal, never white glare |
| `edge.color` (hairline) | `rgba(26,28,25,0.10)` | `rgba(2,6,7,0.60)` | Outer hairline that separates glass from a same-tone page |
| `sheen.from` → `to` (top 60%) | `rgba(255,255,255,0.45)` → 0 | `rgba(150,214,214,0.05)` → 0 | Soft specular gradient on the blur fallback |
| `selection` + `selectionRim` | `rgba(31,92,58,0.10)` + `rgba(31,92,58,0.24)` | `rgba(6,20,13,0.36)` + `rgba(114,190,144,0.50)` | The selected "lens" in the tab bar (fill **and** outline, so selection reads by shape) |
| `pressed` | `rgba(26,28,25,0.06)` | `rgba(4,10,11,0.30)` | Pressed state of controls on glass |
| `scrim.color` / `scrim.reduced` | `rgba(17,19,16,0.32)` / `0.48` | `rgba(3,8,9,0.56)` / `0.72` | Behind sheets and dialogs; the denser value applies when transparency is reduced or contrast is high |
| `ambient.primary` / `secondary` | green 4% / blue 2.5% | teal 8% / violet 6% | The optional ambient wash behind a screen (`<Screen ambient>`): two whisper-quiet diagonal gradients that give glass something to refract. No loud gradients, no imagery (§101) |
| `shadow` | `#0E1A13`, opacity 0.10, radius 24, offset {0, 8} | none | Soft lift for **floating** glass only (tab bar, dialog, toast, FAB). Dark elevation stays tonal |

Glass radii (`theme.glass.radius`) are larger and continuous, and are used **only** by glass chrome: `control` 12, `popover` 16, `dialog` 22, `sheet` 24, `dock` 24, `pill` 999 (tab bar capsule, FAB). Content keeps the §4.1 maximum of 10.

#### Inks allowed on glass and verified contrast

Text on glass must meet WCAG AA against the **worst-case content behind it**: the test composites tint + sheen over white, black, both score inks, both accents, chart series 2, danger, warning, the page, the surface and text itself, and takes the minimum. Only the inks listed per level (`GLASS_INKS`) may be used on that level; `textMuted` is never used on bars, docks or controls.

| Level | Allowed inks | Worst case, light | Worst case, dark |
|---|---|---|---|
| `bar` | `textPrimary`, `textSecondary`, `accent`, `score` | 13.13, 6.55, 6.06, 14.29 | 9.49, 5.65, 5.01, 10.30 |
| `dock` | `textPrimary`, `textSecondary`, `accent`, `score` | 13.82, 6.90, 6.38, 15.05 | 9.49, 5.65, 5.01, 10.30 |
| `control` | `textPrimary`, `textSecondary`, `accent` | 12.58, 6.27, 5.81 | 9.76, 5.82, 5.15 |
| `popover` | `textPrimary`, `textSecondary`, `accent`, `success`, `warning`, `danger`, `score` | 14.91, 7.44, 6.88, 5.67, 5.50, 5.68, 16.23 | 10.66, 6.35, 5.62, 6.06, 6.54, 5.08, 11.57 |
| `sheet` | every text token, `textMuted` included | `textMuted` 5.05, `warning` 5.78, all others higher | `textMuted` 5.02, `danger` 6.24, all others higher |

A selected and pressed tab lens keeps `accent` at 4.70:1 (light) and 7.21:1 (dark) in the worst case. On the opaque twins (transparency reduced) the three `control` inks are at least 6.29:1, and every text token is at least 5.34:1 on the other levels. `src/ui/theme/__tests__/glass.test.ts` recomputes all of this.

#### Platforms (the renderer)

`useGlassRenderer()` picks one of three renderers; every glass component goes through it.

| Renderer | When | What renders |
|---|---|---|
| `liquid` | iOS 26+ with `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` true | Native Liquid Glass: `expo-glass-effect` `GlassView` (`glassEffectStyle` regular, `tintColor` = level tint, `colorScheme` = app theme, `isInteractive` for tappable chrome unless motion is reduced). Neighbouring glass can merge through `GlassGroup` (`GlassContainer`) |
| `blur` | Older iOS, Android, web | `expo-blur` `BlurView` (tint `light`/`dark`, level intensity) + level tint + sheen + rim + hairline edge. On Android the blur samples the screen content through `BlurTargetView` (inside `Screen`); chrome outside a `Screen` (the tab bar) gets the dense tint without a live blur. On web, expo-blur uses CSS `backdrop-filter` |
| `opaque` | Reduce Transparency (system or in-app), or the system high-contrast setting | The level's opaque twin with a solid `border` (`borderStrong` in high contrast) edge; no blur, no sheen, no rim, no ambient wash, denser scrim |

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
| **Boundary rule** | 2 + gap 2 + 1 | `textPrimary` at 100% (2 px) and `border` (1 px) | Under the live score block, between innings on the scorecard, under the tournament header, above "CONTINUE MATCH" on Home. At most two per screen |

Separators are full-bleed inside sections. Rows inside a list use a 16 px left inset, so the separator starts under the text rather than under an icon.

### 4.3 Elevation: minimal, and carried by the glass

| Level | Light | Dark | Used by |
|---|---|---|---|
| 0 | none | none | Everything on the page, including scoring keys |
| 1 (raised content) | `theme.elevation.raised`: iOS `shadowColor #000, opacity 0.10, radius 16, offset {0, 4}`; Android `elevation 6` | no shadow; 1 px `border` top edge | Rare raised content (not used by glass) |
| Glass | `glass.shadow`: `#0E1A13`, opacity 0.10, radius 24, offset {0, 8}, plus the near-white rim | no shadow; the deeper tint and the soft teal rim separate it | Floating glass: tab bar, dialog, toast, FAB (`GlassSurface elevated`) |

No other shadows, and never a shadow on content. Top bars get no shadow either: at rest they are clear, and once content scrolls under them they turn to `bar` glass with a hairline bottom edge (§6.20).

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
| `sm` | 36 visible, 44 hit (hitSlop 4) | 12 | `subhead` 600 14 | 16 |

- **States:** default; pressed (instant background swap, no scale, no opacity flash); disabled (`surfaceSunken` background, `textMuted` label, no border, `accessibilityState.disabled`); loading (spinner 20 replaces the icon, the label stays, width is fixed, presses are ignored, `accessibilityState.busy`); focus (`border.focus`).
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
| EXTRAS | `surface`, 1 `borderStrong`, `plus` icon 20 above `keyLabel` `EXTRAS` (`textPrimary`) |
| WICKET | `surface`, **2 `danger` border**, stumps glyph 20 above `keyLabel` `WICKET` in `danger` |
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
| `6` | `six` | circle | **`accent`** | none | `onAccent` / 700 |
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

### 6.4 OverStrip (§13)

A horizontal row: the `label` "THIS OVER" (or "OVER 17" when read back), then chips at gap 8, then placeholders for the legal balls still due. Height 48, horizontally scrollable when the over has many extras (auto-scrolled to the end, with a fading hairline edge rather than a gradient). The trailing end shows the over's runs so far as a `figureSmall` number with the `label` "RUNS". At over end the strip shows the finished over until the first delivery of the next over; motion is in §8.

### 6.5 Table

| Part | Spec |
|---|---|
| Header row | height 36, `label` style `textSecondary`, hairline bottom border, background `surface` (sticky in scrolling tables) |
| Body row | min height 44 (48 when the row is tappable), `tableNumeric` for numbers, `body` for names, hairline separators, no zebra stripes |
| Alignment | Names left; numbers **right-aligned**, tabular; decimal columns (SR, Econ, NRR) right-aligned to the same number of decimals from `format.ts` |
| Column widths | First column `flex: 1` with min 120; numeric columns fixed: 1–2 digits 32, 3 digits 40, decimals 56, NRR 64 (sign included) |
| Emphasis row | Current batter / bowler / own team: `accentSubtle` background **plus** a 3 px `accent` bar on the leading edge **plus** a marker glyph (▶ striker, `circle-dot` bowler). Three cues, never colour alone |
| Subtext | Dismissal text ("c Rizwan b Hassan") on a second line in `footnote` `textSecondary` |
| Overflow | Horizontal scroll with the first column sticky; the header scrolls with the body. Used by standings at large font scales and by stats tables |
| Totals row | `bodyStrong`, hairline top border plus the boundary rule for the innings total |
| Empty | One row spanning all columns: "No matches played yet" in `textMuted` |
| Accessibility | Each row is one accessible element: "Position 1, Tigers, played 3, won 3, lost 0, no result 0, points 6, net run rate plus 1.234, qualified". Header cells are hidden from the reader (their meaning is included in row labels) |

### 6.6 Tabs (top tabs)

Used for scorecard innings, standings pools and stats categories. Height 44. The tab row is a `bar` glass strip with a hairline bottom edge (`<Tabs floating>` adds the live blur when the row floats over content; inline it is the tint without blur). Labels `subhead` 600 (selected, `textPrimary`) or 500 (unselected, `textSecondary`). The selected indicator is a 2 px `accent` underline across the label width, so selection shows by weight, underline and colour. Tabs scroll horizontally when they exceed the width; the selected tab is scrolled into view. Role `tablist`/`tab` with `accessibilityState.selected`. Swiping between tab panes is optional; every tab is also tappable (§72: nothing hidden behind gestures).

**Bottom tab bar** (`(tabs)/_layout.tsx` → `RouterTabBar`/`TabBar`): 4 items (Home · Tournaments · History · Settings) in a **floating glass capsule**: `bar` glass, radius `pill`, 56 pt items plus 4 pt padding (64 tall), at most 520 wide, 16 from the screen sides, floating 8 pt above the home indicator (`floatingTabBarMetrics`), with the soft glass lift in light and the teal rim in dark. On iOS 26 it is native Liquid Glass and interactive. Icon 24 above a `label`-size (12, not uppercase) caption. Selected: an outlined glass **lens** (`glass.selection` fill + 1 pt `glass.selectionRim`), `accent` icon and 600 caption. Unselected: `textSecondary`, 500. Content scrolls beneath the capsule; `TabChrome` reports its footprint as a chrome inset so every list can still scroll its last row clear of it (§6.20).

### 6.7 SegmentedControl

Track: `control` glass, radius 12, padding 2, height 44 (segments 40). Inline in a form the track is the glass tint without blur; `floating` adds the blur and the glass lift for filter bars that float over content. Selected segment: a **solid** raised lens, `surface` background, 1 `borderStrong`, radius 10, label `subhead` 600 `textPrimary`, with a `check` 16 icon when there are only two segments (colour-independent). Unselected: `textSecondary` 500. Two to four segments; five or more becomes Tabs or a picker sheet. Role `radiogroup` / `radio`. Used for: theme (Light · Dark · System), toss decision (Bat · Bowl), extras type (Wide · No ball · Bye · Leg bye · Other: five items, so that one is Tabs), dot style, history (Matches · Tournaments).

### 6.8 BottomSheet

| Part | Spec |
|---|---|
| Container | `sheet` glass (near-solid: 94% light / 95% dark tint over the blur, sheen in light, rim), top corners radius 24, max height 90% of the window; scoring sheets size to their content. Content inside (rows, fields, chips) keeps its own solid surfaces |
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

`[−] value [+]`: buttons 44 × 44 (`secondary`, radius 6, icons `minus`/`plus` 20); value `scoreMedium`-style Barlow Condensed 600 24, tabular, min width 56, centered. Tapping the value opens a numeric TextField in place. Long-press repeats after 400 ms every 100 ms (a convenience; plain taps work). At a bound the button is disabled. Accessibility role `adjustable` with increment/decrement actions and a label like "Overs, 20". Used for: custom overs, players per side, balls per over, custom extras runs, pool count, legs.

### 6.13 ListRow

Min height 56 (48 for single-line settings rows). Padding x 16, y 12. Slots: leading (icon 20 `textSecondary`, or a 32 initials monogram: `surfaceSunken` square radius 6, `subhead` 600), title `body`, optional subtitle `footnote` `textSecondary` (max 2 lines), trailing (value `body` `textSecondary` / `chevron-right` / Switch / Badge / `ellipsis` IconButton). Pressed: `surfaceSunken`. Separator: hairline inset 16 (inset 64 with a leading monogram). The whole row is one accessible element; the trailing menu is a separate button with a label ("More actions for Lions v Tigers").

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

The platform `Switch`, tinted `accent` (track on) and `borderStrong` (track off). It always sits in a ListRow whose title names the setting. The row is the accessible element (role `switch`).

### 6.20 Glass components (§106)

Everything glass is built from `src/ui/glass`; `expo-glass-effect` and `expo-blur` are imported nowhere else (enforced by `src/__tests__/codeRules.test.ts`), so the platform resolver and Reduce Transparency always apply. The feature-team API, with code, is in `.workflow/wave3/glass-foundation.md`.

| Component | What it is | Key props |
|---|---|---|
| `GlassSurface` | A view whose background is glass at a level. iOS 26: `GlassView`; elsewhere `GlassMaterial` under the children; opaque twin when transparency is reduced | `level`, `radius`, `corners` (`all`/`top`/`bottom`), `rim` (`all`/`top`/`bottom`/`none`), `sheen`, `blur`, `active` (fades the material in/out), `elevated` (glass lift), `interactive` (iOS 26 touch response) |
| `GlassMaterial` | The material alone, absolutely filling its parent and hidden from assistive technology, for parents that animate themselves (Sheet, Dialog, Toast) | same material props |
| `GlassBar` | Top bar: `bar` glass, bottom rim/edge, safe-area top padding, clear until `scrolled` | `scrolled`, `safeArea`, `floating` |
| `GlassDock` | Bottom dock: `dock` glass, 24 pt top corners, lit top rim, safe-area bottom padding | `safeArea`, `floating`, `offset`, `rounded` |
| `GlassGroup` | Lets neighbouring glass merge and morph on iOS 26 (`GlassContainer`); a plain view elsewhere | `spacing` |
| `AmbientBackground` | The whisper-quiet wash behind a screen; off when transparency is reduced | – |
| `Screen` | Page frame that wires it all: `header` in a floating `GlassBar`, `footer` in a floating `GlassDock` (`footerPadding="flush"` for a scoring pad), status-bar glass on scroll, `ambient`, content insets, toast anchor | `header`, `footer`, `footerPadding`, `scroll`, `ambient`, `barTitle` |
| Insets | `useContentInsets()` (safe area + chrome above/below), `useChromeInsets()`, `useScreenList()` (padding, indicator insets and the glass scroll handler for a FlatList inside a non-scrolling `Screen`), `ChromeInsetsProvider` | – |
| Toast anchor | `ToastAnchorProvider` (root), `useToastAnchor({ edge, offset })` | – |
| Built-in users | `TabBar` (floating capsule), `Tabs`, `SegmentedControl`, `FloatingActionButton` (pill `bar` glass, rides above the tab bar through `useContentInsets`), `Sheet`, `Dialog`, `Toast` | – |

**Scroll-under behaviour.** Top bars are clear at rest and fade to glass (`motion.fast`, instant when motion is reduced; on iOS 26 the native glass animates in) once the content has scrolled more than 2 pt beneath them. Screens without a header get the same treatment for the status-bar strip, optionally with a centred `barTitle` (iOS large-title style).

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
| **Six** (slightly stronger) | Same entry as four; the ring expands 1 → 1.4 over 320 ms; the score figure's **new digits** show in `accent` for 400 ms, then return to `score` over `motion.base` | Instant chip; accent tint on digits held for 400 ms, then swapped back without a fade |
| **Wicket** (brief) | The wickets digit rolls; a 2 px `danger` rule draws left → right under the score block (`motion.slow`), holds 300 ms, then fades (`motion.exit`); the W chip enters with scale 0.85 → 1 | The danger rule appears and disappears (no draw); chip instant |
| **End of over** (smooth) | The strip slides left by its width while the next (empty) strip slides in, `motion.slow`. The finished over collapses into a one-line summary "Over 17 · 9 runs · Hassan" that stays in the strip header until the next delivery | Crossfade 120 ms |
| **Innings complete / pending panel** | The panel slides up from the pad area, `motion.base`; the pad fades out behind it | Crossfade 120 ms |
| **Result** (refined) | The result line fades in and rises 8 px (`motion.slow`) after a 120 ms delay; the boundary rule under it draws left → right over 320 ms. Nothing else moves | Instant |
| **Sheets** | Open: translateY 100% → 0, `motion.base`; close: `motion.exit`. Scrim fades with them | Opacity only, 120 ms |
| **Dialog** | Fade + scale 0.98 → 1, `motion.fast` | Fade only |
| **Toast** | Fade + translateY 8 → 0, `motion.fast` | Fade only |
| **Tab / screen transitions** | Platform native-stack defaults | Native stack with `animation: 'none'` |
| **Glass under scroll** | Top-bar material fades in over `motion.fast`; iOS 26 glass animates its style change (0.2 s) | Instant switch, no animation |
| **Glass touch (iOS 26)** | Interactive glass on the tab bar and FAB responds to touch (the native highlight and flex) | `isInteractive` off: no morphing or highlight |
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

- `theme/tokens.ts`: `lightColors`, `darkColors` (every key in §1.1 and §1.2), `space`, `radius`, `border`, `elevation`, `motion`. With `theme/glass.ts` (`lightGlass`, `darkGlass`, `GLASS_INKS`, `glassRadius`, §1.4), these are the **only** files with colour literals.
- `glass/*`: `GlassSurface`, `GlassMaterial`, `GlassBar`, `GlassDock`, `GlassGroup`, `GlassBackdrop`, `AmbientBackground`, the renderer resolver (`useGlassRenderer`), the content-inset hooks, and a test seam (`glass/testing`: `setLiquidGlassAvailable`) for the iOS 26 path. The only place `expo-glass-effect` and `expo-blur` are imported.
- `theme/ThemeProvider.tsx`: resolves `ThemePreference` (`system` uses `useColorScheme()`), the reduced-motion preference and Reduce Transparency (in-app `settings.reduceTransparency` OR the system setting: iOS `isReduceTransparencyEnabled`, web `prefers-reduced-transparency`); exposes `useTheme()`, `useGlass()`. Switching theme re-renders without remounting screens.
- `typography/Text.tsx`: `<Text variant>` with the table in §2. Numeric variants set `fontVariant: ['tabular-nums']` and per-variant `maxFontSizeMultiplier` (RESPONSIVE.md §5).
- `primitives/*`: every component in §6, with RNTL tests for role, label, disabled/selected state, and hit size ≥ 44.
- `scoreboard/*`: `ScoreFigure`, `BallChip`, `OverStrip`, `StatLine` (batter/bowler row), `ScoreKey`, `ScoringPad`.
- `charts/*`: `WormChart`, `ManhattanChart`, `PartnershipBars` over `react-native-gifted-charts`, themed per THEMES.md §4.
- The grep test "no hex outside `src/ui/theme`" covers `src/features` and `src/app`.
