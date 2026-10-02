# Scorebook — Themes

Spec: §68 (light), §69 (dark), §70 (system), §71 (semantic tokens), §83 (PDF), §106 (liquid glass). The token values and contrast ratios are in [DESIGN_SYSTEM.md §1](DESIGN_SYSTEM.md), the glass material in [DESIGN_SYSTEM.md §1.4](DESIGN_SYSTEM.md). This document explains **why** each theme looks the way it does and maps every component to tokens in both themes, so the two stay consistent without being inversions of each other.

## 1. Theme selection (§70)

| Setting (`settings.theme`) | Behaviour |
|---|---|
| `system` (default) | Follows `useColorScheme()`. Changes live when the OS switches (e.g. automatic dark at sunset) without remounting screens. `app.json` already sets `userInterfaceStyle: "automatic"` |
| `light` / `dark` | Fixed regardless of the OS |

- The switch is instant. There is no cross-fade, because a fade across the whole UI would read as a glitch mid-scoring.
- Status bar: `dark-content` on light, `light-content` on dark (`expo-status-bar` style `auto`, resolved from the effective theme, not the OS).
- Android navigation bar: `background` colour, with button style matching the status bar (`expo-system-ui` sets the root background to `background`, so there is no white flash on navigation).
- The splash stays `#1F5C3A` in both themes (brand moment, `app.json`). The first frame after the splash is `background` of the effective theme.
- **The PDF never follows the app theme** (§5 below).
- **Glass follows the theme.** Each theme has its own glass palette (`lightGlass`, `darkGlass`), and on iOS 26 the native glass gets `colorScheme` from the effective app theme, not the OS, so a forced Dark theme on a light phone still gets dark glass.
- **Reduce transparency** (in-app switch in Settings → Appearance, or the system setting) keeps the theme and swaps every glass surface for its opaque twin (§2.3).

## 2. Rationale

### 2.1 Light: "the scorebook page in daylight" (§68)

- **Background `#F5F3EC`** is a warm, slightly yellowed off-white, like scorebook paper. It lowers glare outdoors compared with `#FFFFFF`, and it keeps white surfaces (tables, keys, inputs) visibly distinct without shadows. Separation comes from tone, not elevation.
- **Surfaces `#FFFFFF`** are where data lives: tables, rows, scoring keys. The page-versus-sheet contrast mimics a card inserted in a book, without drawing cards.
- **Charcoal ink `#1A1C19`** (15.45:1 on the page) is deliberately not pure black, which vibrates against warm white. The **score** token `#111310` is one step darker and is reserved for the scoreboard figure and keys, so the score is the highest-contrast object on screen (§10 "score is visually dominant").
- **Slate secondary `#474E49` / muted `#646A65`** have a green-grey cast that belongs to the palette. Both clear 4.5:1 on every surface, including `surfaceSunken` (4.56). Outdoors in sunlight, low-contrast "subtle" grey text is the first thing to disappear, so there is none (§72).
- **Cricket green `#1F5C3A`**: a deep, desaturated pitch/scoreboard green, already the brand colour in `app.json`. It is dark enough to be text (7.14:1) and to carry white text (7.92:1). It is used sparingly: the primary button, selection, the striker marker, the six chip, links.
- **Status hues** are earthy and dark enough to be text: danger brick `#B3261E`, warning ochre `#8A5300`, success `#276A3E` (a different green from the accent, so "Qualified" is not confused with "selected"). Every status is paired with text or an icon.
- **Soft shadows** (§68) appear only on floating glass (tab bar, dialogs, toasts, the FAB), at 10% opacity with a green-black tint. Everything else is flat and separated by hairlines.

### 2.2 Dark: "a stadium scoring console at night" (§69)

Designed independently, not inverted:

- **Background `#111412`**: deep charcoal with a faint green undertone, like the unlit panels of a scoreboard. It is not `#000000`, which smears on OLED when scrolling and makes the text halation worse.
- **Raised surfaces** step up in lightness: `surface #181C19` → `surfaceElevated #212622`. In the dark, **elevation is tone, not shadow**, so the dark theme has no shadows at all.
- **Text `#ECEEE9`** is slightly warm off-white (15.87:1). Pure white on near-black causes glare in a dark ground at night. The **score** token `#F6F7F3` is the brightest value, again reserved for the scoreboard.
- **Accent `#72BE90`** is a restrained, desaturated green. A saturated "neon" green would glow on dark (§69 "no neon/glow"). Its lightness (8.37:1 on background) lets it work as text and as a fill with **dark text** `#0A1A10` on it (8.12:1). White on a mid green would fail contrast, so on dark the primary button has dark text, which also reads less like a glowing LED.
- **Dividers** `#2B312D` are clear but quiet (§69 "clear dividers"). Affordance borders use `borderStrong #646E66` (≥ 3:1).
- **Danger `#EE8A7F`** is a soft coral rather than pure red. Bright red on black vibrates. The W chip uses a coral fill with dark text (7.68:1).
- **Night-time rule**: no large bright areas. Sheets are deep teal-charcoal glass (`rgba(20,27,30,0.95)`), not grey-white, and glass rims are a soft teal at 20–38%, never white glare. The only bright elements are text, the score and the accent.

### 2.3 Glass in each theme (§106)

Glass is the floating layer; the page under it is the same scorebook page as before.

- **Light: frosted paper.** The glass is a pale, warm white (`rgba(251,251,248,…)`), so it blends into the `#F5F3EC` page without a harsh block. A near-white rim (55% white, 90% on the top edge) catches the light, a 45% white sheen fades down the top 60%, and a hairline at 10% charcoal keeps the edge visible over white rows. Ink on it is charcoal (`textPrimary`) or the score black. Floating glass gets the soft 10% lift.
- **Dark: night glass.** The glass is deep charcoal with a teal-navy cast (`rgba(18,26,28,0.88)` for bars), never transparent black: the cooler hue separates it from the green-charcoal page, and the dense tint keeps it from looking muddy over bright content. Rims are soft teal (20%, 38% on top) instead of white glare, the sheen is a 5% teal breath, and the ambient wash under screens is teal and muted violet. Ink is the bright off-white `textPrimary`, the score white or the pastel accent. No shadows: elevation is tone and rim.
- **Density is the legibility control.** Tints run from 80% (bars, light) to 95% (sheets, dark). They were chosen so that every allowed ink still clears WCAG AA over the worst content that can scroll beneath (white, black, the score inks, both accents, chart blue, danger, warning): DESIGN_SYSTEM §1.4 lists the minimums.
- **Reduce transparency** replaces the tint with its opaque twin (same RGB, alpha 1), drops blur, sheen, rim and the ambient wash, draws a solid `border` edge (`borderStrong` under high contrast), and darkens the scrim. The system high-contrast setting does the same.

## 3. Component-by-component mapping

`L` = light value, `D` = dark value (hex from DESIGN_SYSTEM §1). The token name is the contract; the hex is shown for review.

### 3.1 App chrome

| Element | Token | L | D |
|---|---|---|---|
| Screen background | `background` | `#F5F3EC` | `#111412` |
| Top bar at rest | clear: the page shows (`background`) | `#F5F3EC` | `#111412` |
| Top bar once content scrolls under it | `bar` glass + hairline `glass.edge` bottom | `rgba(251,251,248,0.80)` + `rgba(26,28,25,0.10)` | `rgba(18,26,28,0.88)` + `rgba(2,6,7,0.60)` |
| Top bar title / icons | `textPrimary` | `#1A1C19` | `#ECEEE9` |
| Tab bar | floating `bar` glass capsule, `glass.rim`, glass lift (light) | `rgba(251,251,248,0.80)`, rim white 55% / 90% top | `rgba(18,26,28,0.88)`, rim teal 20% / 38% top |
| Tab selected (icon, caption) | `accent` on the glass lens (`glass.selection` + `glass.selectionRim`) | `#1F5C3A` on green 10% + 24% rim | `#72BE90` on `rgba(6,20,13,0.36)` + green 50% rim |
| Tab unselected | `textSecondary` | `#474E49` | `#B4BBB4` |
| Screen ambient wash (optional) | `glass.ambient` | green 4% + blue 2.5% | teal 8% + violet 6% |

### 3.2 Scoring screen

| Element | Token | L | D |
|---|---|---|---|
| Score figure `142/4` | `score` | `#111310` | `#F6F7F3` |
| Overs `16.4` | `textPrimary` | `#1A1C19` | `#ECEEE9` |
| "of 20", "ov" | `textMuted` | `#646A65` | `#8E968F` |
| Rates labels (`CRR`) / values | `textSecondary` / `textPrimary` | – | – |
| Boundary rule | 2 px `textPrimary` + 1 px `border` | `#1A1C19` + `#DDD9CE` | `#ECEEE9` + `#2B312D` |
| Striker row | `accentSubtle` bg, `accent` bar and ▶ | `#E2ECE4` / `#1F5C3A` | `#1C3326` / `#72BE90` |
| FREE HIT pill | `warningSubtle` bg, `warning` text | `#FAEFD9` / `#8A5300` | `#33291A` / `#E3B55E` |
| Pad well (edit ball only; on the live screen the dock is the well) | `surfaceSunken` | `#ECE9E0` | `#0B0D0C` |
| Run key face / border / digit | `surface` / `borderStrong` / `score` | `#FFFFFF` / `#8A877C` / `#111310` | `#181C19` / `#646E66` / `#F6F7F3` |
| Run key pressed | `accentSubtle` | `#E2ECE4` | `#1C3326` |
| WICKET key border + label | `danger` | `#B3261E` | `#EE8A7F` |
| WICKET key pressed | `dangerSubtle` | `#FBE8E6` | `#3A1E1B` |
| Live score band (top) | `bar` glass under the score (`GlassBar`); inks `score`, `textPrimary`, `textSecondary`, `accent` | `rgba(251,251,248,0.80)` | `rgba(18,26,28,0.88)` |
| Scoring dock (action row + pad) | `dock` glass, 24 pt top corners, lit top rim | `rgba(251,251,248,0.84)` | `rgba(18,26,28,0.88)` |
| Action row icons + labels (on the dock) | `textPrimary`; disabled controls may use `textMuted` with the disabled state (WCAG exempts them); nothing that carries information is `textMuted` on glass | – | – |
| Pending-action panel | Replaces the pad inside the dock; its rows keep solid `surface` faces | `#FFFFFF` | `#181C19` |

### 3.3 Ball chips (DESIGN_SYSTEM §6.3)

| Kind | Fill | Border | Text | L sample | D sample |
|---|---|---|---|---|---|
| dot | – | `border` | `textMuted` | ring `#DDD9CE`, text `#646A65` | ring `#2B312D`, text `#8E968F` |
| runs | – | `borderStrong` | `textPrimary` | `#8A877C` / `#1A1C19` | `#646E66` / `#ECEEE9` |
| four | – | 2 px `accent` | `accent` | `#1F5C3A` | `#72BE90` |
| six | `accent` | – | `onAccent` | `#1F5C3A` / `#FFFFFF` | `#72BE90` / `#0A1A10` |
| wicket | `danger` | – | `onDanger` | `#B3261E` / `#FFFFFF` | `#EE8A7F` / `#240907` |
| wide, no_ball | – | dashed `borderStrong` | `textSecondary` | `#8A877C` / `#474E49` | `#646E66` / `#B4BBB4` |
| bye, leg_bye (capsule) | – | `borderStrong` | `textSecondary` | same | same |
| free-hit bar | `warning` | – | – | `#8A5300` | `#E3B55E` |
| placeholder | – | dotted `border` | – | `#DDD9CE` | `#2B312D` |

The dot ring (`border` on `surface`, 1.41:1) is intentionally faint. It is decorative because the "0"/"•" text carries the meaning at 5.54:1.

### 3.4 Lists, tables, forms

| Element | Token |
|---|---|
| Row background / pressed | `surface` / `surfaceSunken` |
| Row separators | `border` hairline |
| Section header text | `textSecondary` |
| Table header text | `textSecondary`; body numbers `textPrimary` |
| Highlight row (own team, current bowler) | `accentSubtle` + `accent` bar |
| Withdrawn / eliminated team names | `textMuted` (always with a text badge) |
| Input background / border / focus | `surface` / `borderStrong` / 2 px `accent` |
| Input error | 2 px `danger` + `danger` message |
| Placeholder | `textMuted` |
| Segmented track / selected | `control` glass (`rgba(232,229,220,0.84)` / `rgba(8,12,13,0.84)`) / solid `surface` lens + `borderStrong` |
| Top tabs row | `bar` glass strip with a hairline bottom edge; `accent` underline on the selected tab |
| Switch on / off track | `accent` / `borderStrong` |

### 3.5 Overlays and feedback

| Element | Light | Dark |
|---|---|---|
| Bottom sheet, dialog | `sheet` glass `rgba(251,251,248,0.94)`, sheen, white rim; dialog with the glass lift | `sheet` glass `rgba(20,27,30,0.95)`, teal rim, no shadow |
| Menus (`ChoiceSheet`) | sheet glass, as above | sheet glass, as above |
| Scrim | `glass.scrim` `rgba(17,19,16,0.32)` (reduced: 0.48) | `rgba(3,8,9,0.56)` (reduced: 0.72) |
| Toast | `popover` glass `rgba(251,251,248,0.90)` + lift, text and icon `textPrimary #1A1C19`, action `accent #1F5C3A` | `popover` glass `rgba(22,31,34,0.90)` + teal rim, text `textPrimary #ECEEE9`, action `accent #72BE90` |
| FAB | pill `bar` glass + lift, `accent` icon and label | pill `bar` glass + teal rim, `accent` icon and label |
| Warning banner | `warningSubtle` + 3 px `warning` bar, text `textPrimary` | same tokens |
| Danger banner | `dangerSubtle` + 3 px `danger` bar | same tokens |
| Skeleton | `surfaceSunken` | `surfaceSunken` (`#0B0D0C` on `#111412`): subtle but visible |
| Focus ring | `focusRing #1F5C3A` | `focusRing #9AD3AF` |

### 3.6 Badges

| Badge | Light | Dark |
|---|---|---|
| Live | `accentSubtle` / `accent` | `#1C3326` / `#72BE90` |
| Qualified | `successSubtle` / `success` | `#1A3023` / `#7CC49A` |
| Manual Override, Paused, Provisional-warning | `warningSubtle` / `warning` | `#33291A` / `#E3B55E` |
| Needs repair | `dangerSubtle` / `danger` | `#3A1E1B` / `#EE8A7F` |
| Neutral (Scheduled, In contention) | outline `borderStrong`, text `textSecondary` | same tokens |

## 4. Chart theming (§67 "charts", `src/ui/charts`)

Charts use `react-native-gifted-charts` wrapped by `WormChart`, `ManhattanChart` and `PartnershipBars`. The wrappers take tokens, never hex.

| Role | Token | Light | Dark |
|---|---|---|---|
| Series 1: side batting first | `chartSeries1` | `#2A7F50` | `#55A877` |
| Series 2: side batting second | `chartSeries2` | `#4A6FC0` | `#7792DA` |
| Gridlines (horizontal only) | `chartGrid` | `#E7E4DA` | `#252A26` |
| Axis line / ticks | `border` | `#DDD9CE` | `#2B312D` |
| Axis labels, values, legend text | `textSecondary` (`footnote`, tabular) | `#474E49` | `#B4BBB4` |
| Chart background | `surface` (charts sit on the page surface, no card) | `#FFFFFF` | `#181C19` |
| Wicket markers | `textPrimary` dot 8 px with a 2 px `surface` ring + "W" label | – | – |
| Powerplay band | `surfaceSunken` vertical band behind the powerplay overs + `label` "PP" | – | – |

Rules (from the dataviz method; the palette was validated with its checker):
- **Two series maximum.** Innings are the only categorical identity in match analytics. The chart series colours are separate from the UI accent so a "selected" state is never confused with "team 1". They passed the validator in both themes (lightness band, chroma floor, CVD separation ΔE 17.8 light / 15.3 dark, normal-vision floor, contrast ≥ 3:1 against the surface).
- **Never colour alone.** Series 2 is drawn **dashed** (6 on / 4 off) in the worm; in Manhattan the two innings are separate small multiples (stacked, same y-scale), each titled with the team short name. Lines carry direct end labels (team short name) plus a legend.
- **Thin marks.** Lines 2 px; bars have a 4 px top radius, 2 px gaps and a baseline anchor; markers at least 8 px.
- **Text is never series-coloured.** Labels and values use text tokens.
- **One y-axis** (runs). No dual axes.
- **Status colours are not used in charts.** Wickets use the ink dot plus "W", not red.
- **Table view.** Each chart has a "Show as table" toggle (ACCESSIBILITY.md §8).
- **Tooltips.** Tapping a bar or point shows a small `surfaceElevated` callout: "Over 17 · 9 runs · 1 wicket". Selection is shown with a 2 px `textPrimary` outline, not a colour change.
- **Dark theme** uses its own series steps (above), not the light values.

## 5. PDF theming (§83, WP-export)

The PDF is a printed scorecard: it is always **light, ink on white**, independent of the app theme (WP-export acceptance: "light print styling independent of app theme"). The HTML builders in `src/export/pdf` embed their own CSS. They do not import `src/ui` tokens (export must not depend on UI), so the print palette is duplicated as constants inside the export module with these values:

| Print token | Value | Use |
|---|---|---|
| paper | `#FFFFFF` | Page |
| ink | `#1A1C19` | All text, rules |
| inkSecondary | `#474E49` | Meta lines, column headers |
| rule | `#1A1C19` 0.75 pt / hairline `#BDB9AE` 0.5 pt | Boundary rule / row separators |
| accent | `#1F5C3A` | Title rule, "Winner" mark only |
| band | `#F2F0E9` | Alternate over-summary rows (the only zebra, for scanning printed rows) |

- **Type.** CSS `font-family: 'Inter', -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif` for text and `'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif` for the score figures, with `font-variant-numeric: tabular-nums` on every table. Fonts are not embedded by default, because `expo-print` renders through the OS web view, which cannot see the app's bundled fonts. If the builders later accept base64 `@font-face` data supplied by `ExportService`, they may embed Barlow Condensed 600 only (numerals).
- **Page.** A4 portrait, margins 14 mm; `@page` running footer "Scorebook · <match title> · page n of m"; tables use `break-inside: avoid` per innings block; headers repeat on page breaks (`thead { display: table-header-group }`).
- **Layout.** Title block (match title 18 pt bold, result 12 pt, then toss / venue / date 9 pt), then per innings: batting table, extras + total with a 0.75 pt double rule, did not bat / absent, FoW line, bowling table, partnerships, over summary (a grid of ball tokens in text, with W in bold, the dashed box drawn as a 0.5 pt dashed border), then tournament standings (tournament matches). Base size 9 pt; tables 8.5 pt.
- **Colour independence** holds in print: wickets are **bold W**, fours and sixes are text tokens, and grey-scale printing loses nothing.
- **Tournament PDF** (§82): cover (name, season, champion), final standings per pool with qualification text, results list, bracket drawn as a table of rounds, records.
- **In-app PDF preview** (if shown before sharing) sits on the `background` of the current theme. The page itself stays white.

## 6. Testing the themes

- Snapshot every primitive in both themes (RNTL + `ThemeProvider` forced to light/dark).
- The contrast unit test iterates over the pair list in DESIGN_SYSTEM §1.3 using the same WCAG formula. It fails below the listed requirement.
- The glass test (`src/ui/theme/__tests__/glass.test.ts`) composites every level's tint and sheen over the worst-case backdrops and checks every allowed ink at 4.5:1, the pressed and selected lens states, the opaque twins, the ambient wash, the light/dark character rules (pale white with white rims; deep hued tint with coloured rims) and that dark is not an inversion of light.
- Manual glass check: scroll a scorecard and the history list under the top bar and tab bar on an iOS 26 device, an older iPhone, an Android phone and the web build, in both themes, with Reduce Transparency on and off.
- Manual outdoor check: score a mock over at maximum brightness in direct sun in light theme, and at minimum brightness at night in dark theme. Record the pass or fail in the QA sheet.
