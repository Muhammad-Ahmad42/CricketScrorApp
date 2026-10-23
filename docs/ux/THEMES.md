# Scorebook — Themes

Spec: §70 (system), §71 (semantic tokens), §83 (PDF), §106 (liquid glass), **§107 (Cyber-Cyan / Deep Electric Teal palette, supersedes the colour direction of §68 and §69)**. The token values and contrast ratios are in [DESIGN_SYSTEM.md §1](DESIGN_SYSTEM.md), the glass material in [DESIGN_SYSTEM.md §1.4](DESIGN_SYSTEM.md). This document explains **why** each theme looks the way it does and maps every component to tokens in both themes, so the two stay consistent without being inversions of each other.

## 1. Theme selection (§70)

| Setting (`settings.theme`) | Behaviour |
|---|---|
| `system` (default) | Follows `useColorScheme()`. Changes live when the OS switches (e.g. automatic dark at sunset) without remounting screens. `app.json` already sets `userInterfaceStyle: "automatic"` |
| `light` / `dark` | Fixed regardless of the OS |

- The switch is instant. There is no cross-fade, because a fade across the whole UI would read as a glitch mid-scoring.
- Status bar: `dark-content` on light, `light-content` on dark (`expo-status-bar` style `auto`, resolved from the effective theme, not the OS).
- Android navigation bar: `background` colour, with button style matching the status bar (`expo-system-ui` sets the root background to `background`, so there is no white flash on navigation).
- The native splash and the Android adaptive-icon background are configured in `app.json` on §107 obsidian `#070E12`; `BRAND_SPLASH_COLOR` mirrors it. The first frame after the splash is `background` of the effective theme.
- **The PDF never follows the app theme** (§5 below).
- **Glass follows the theme.** Each theme has its own glass palette (`lightGlass`, `darkGlass`), and on iOS 26 the native glass gets `colorScheme` from the effective app theme, not the OS, so a forced Dark theme on a light phone still gets dark glass.
- **Reduce transparency** (in-app switch in Settings → Appearance, or the system setting) keeps the theme and swaps every glass surface for its opaque twin (§2.3). The ambient page light stays.

## 2. Rationale

The identity is **night stadium + professional scoring HUD + liquid glass**. It is a live cricket scoring console, not a gaming dashboard: no neon, no glowing blobs, no RGB. Cyan and deep teal carry identity and interaction; the cricket feel comes from the information design (§101). Green survives only as the small `success` signal; no chart series is green.

### 2.1 Dark: "the scoring console under floodlights" (primary expression)

- **Background `#070E12`** is obsidian with a cold blue-teal undertone, never `#000000` (which smears on OLED when scrolling and worsens halation). It is never a single flat fill: every `Screen` lays two very large, very soft glows over it, `#0D3843` at 18% from the top-left and `#08313A` at 10% from the centre-right, fading back to `#070E12` at the bottom, like floodlight spill in the night air. The lit page differs from the plain page by at most 1.076:1, so it reads as atmosphere, never as a blob.
- **Solid content surfaces** step up in lightness from the page: `surface #0D171C` → `surfaceElevated #132129`; `surfaceSunken #04090C` sits below it. In the dark, **elevation is tone, not shadow**, so the dark theme has no shadows.
- **Text `#F2F7F9`** is a cool off-white (18.00:1); **secondary `#8FA7B3`** and **muted `#7F97A3`** are cool blue-greys that still clear 4.5:1 on every surface. The **score** token `#F8FCFD` is the brightest value and is reserved for the scoreboard.
- **Accent `#00C2E0`** cyan carries interaction: primary buttons (with dark ink `#010B0E`, 9.28:1), selection, links, the striker marker, the FOUR ring. **Deep teal `#008BA3`** (`accentDeep`) is the secondary fill: the SIX disc and selection lenses. **Bright `#28D9F2`** (`highlight`, `focusRing`) is reserved for moments that deserve attention: keyboard focus, the live indicator, a genuine highlight. Routine 4s and 6s never use it, and nothing uses `#00E5FF`-style ultra-bright cyan.
- **Dividers** `#1A2A33` are cool and quiet; affordance borders use `borderStrong #5A7482` (≥ 3:1).
- **Status:** success `#35D49A`, wicket/danger `#FF5252`, warning `#FFB74D`, each with a deep tinted subtle (`#0B2A22`, `#2D1316`, `#2A2014`) for badges, banners and the pressed WICKET key. The W chip is a red square with dark ink (6.13:1); every status is paired with text or an icon.
- **Night-time rule**: no large bright areas. Sheets are deep teal-charcoal glass, glass rims are soft cyan at 20–48%, never white glare. The only bright elements are text, the score and the accent.

### 2.2 Light: "a cool ice scorebook" (designed separately, not an inversion)

- **Background `#F0F5F8`** is a cool ice, lit by a faint cyan glow (6%) from the top-left and a soft white light (60%) from the centre-right; **surfaces `#FFFFFF`** are where data lives (tables, rows, scoring keys). Page-versus-sheet tone separates them without shadows.
- **Deep teal ink `#0B232B`** (14.83:1 on the page) is deliberately not black; **`textSecondary #3D5864`** and **`textMuted #526B77`** are teal-greys that clear 4.5:1 on every surface, `surfaceSunken` included (4.66). The **score** `#061A20` is one step darker.
- **Interaction is deep teal, not cyan.** Cyan on white fails WCAG, and even the §107 deep teal `#008BA3` is only 4.02:1 on white. So light `accent` is **`#00606F`** (7.23:1 on white, 6.59:1 on ice, and it keeps AA on the light glass bars), pressed `#004A56`, the SIX fill `accentDeep #007385` under white digits (5.54:1). `#008BA3` is used only where 3:1 suffices: the focus ring and `highlight` (3.66:1 on ice). Cyan proper appears only in rims, edges and the ambient light.
- **Status hues** are dark enough to be text: danger `#C42B2B`, warning `#8A5000`, success `#0C7552`.
- **Soft shadows** appear only on floating glass (tab bar, dialogs, toasts, the FAB), at 10% opacity with a teal-black tint `#06222B`. Everything else is flat and separated by hairlines.

### 2.3 Glass in each theme (§106, §107)

Glass is the floating layer; the page under it is the scorebook.

- **Dark: night glass.** The bars are exactly the §107 `rgba(15,27,34,0.70)` charcoal with a teal-navy cast, frosted at 24 px with 160% saturation, so cards, buttons and the ambient light visibly move beneath them; the dock is 0.76. AA comes from the **glass inks** (paler slate `#ABBDC7` for secondary text, cyan `#26CCE6` for accent, §2.4), not from a denser tint. A 1 px rim `rgba(0,194,224,0.20)` runs round the edge; the **top edge** (`rgba(40,217,242,0.40)`) and the **left edge** (`0.30`) are brighter, so the glass catches light from the top-left. A 7% cyan sheen fades down the top 45%. The **scoring dock** is the strongest glass: densest chrome tint and a stronger rim (`0.30` / `0.50` top / `0.38` left). The selected tab is a deep-teal lens (`rgba(0,72,86,0.55)`) with a cyan outline. No shadows: elevation is tone and rim.
- **Light: frosted ice.** Pale white translucent glass (`rgba(252,254,255,0.60)` bars, `0.66` dock, 170% saturation) with near-white rims (70%, top 92%, left 84%) sitting just inside a **1 px faint cyan edge** (`rgba(0,139,163,0.30)`), so the edge reads as a highlight over a soft line even over white rows, and a visible 65% white sheen. Ink on it is the deep-teal `textPrimary`, the glass inks `#2F4954` / `#004D5A`, or the score ink. The selected tab is a pale ice lens with a deep-teal outline. Floating glass gets the soft 10% lift; a top bar gets it once content scrolls under it.
- **Top bars rest as glass.** At rest a header shows its tint, sheen and bottom rim at 60% strength over the ambient page (never invisible), and strengthens to 100% once content scrolls under it.
- **Popovers and sheets are denser** because they carry longer text: dark popover 0.90, sheets 0.82 over the scrim in a deeper `rgba(9,17,22,…)` charcoal so the raised in-sheet rows (`surfaceElevated`) stand apart at ≥ 1.15:1; light popover 0.86, sheets 0.88.
- **Reduce transparency** replaces the tint with its opaque twin (same RGB, alpha 1), drops blur, sheen and rim, draws a solid `border` edge (`borderStrong` under high contrast), and darkens the scrim. The ambient glows stay: they are page light, not glass. The system high-contrast setting does the same for glass and also removes the glows.

### 2.4 How "AA on glass" is measured

Blur averages what is behind the glass, so the worst case is not raw white or black but **a bright, button-sized fill or a dense run of text under the blur**. The model (`src/ui/theme/glass.ts`, ACCESSIBILITY.md §7.1) treats blur intensity as Gaussian σ = 0.24 px per unit (100 → 24 px, the web value and the smallest of the platforms), computes how much of a 56 px block (coverage 0.757) or a 16 px detail (0.199) survives, mixes every bright fill and every ink into every solid field in both sRGB and linear light, composites the tint with and without the sheen, and takes the minimum. Unblurred tints are checked against raw white, raw black and every token. At the §107 alpha 0.70 the page `textSecondary` would sit below 4.5:1 on the dark bar, and the page `accent` below 4.5:1 on the 0.60 light bar; the glass inks (one small step further from the tint) bring them to 4.60 / 5.23 so the tints can stay light enough to be seen. All figures are in DESIGN_SYSTEM §1.4.

## 3. Component-by-component mapping

`L` = light value, `D` = dark value (hex from DESIGN_SYSTEM §1). The token name is the contract; the hex is shown for review.

### 3.1 App chrome

| Element | Token | L | D |
|---|---|---|---|
| Screen background | `background` + `glass.ambient` glows on **every** `Screen` (`flat` opts out; high contrast removes them) | `#F0F5F8` | `#070E12` |
| Top bar at rest | `bar` glass at `glass.rest` 60% + bottom rim and edge | – | – |
| Top bar once content scrolls under it | `bar` glass at 100% + `glass.edge` bottom line + lift (light) | `rgba(252,254,255,0.60)` + `rgba(0,139,163,0.30)` | `rgba(15,27,34,0.70)` + `rgba(1,5,7,0.60)` |
| Top bar title / icons | `textPrimary`; subtitles and secondary icons the glass secondary ink, actions the glass accent ink | `#0B232B` / `#2F4954` / `#004D5A` | `#F2F7F9` / `#ABBDC7` / `#26CCE6` |
| Tab bar | floating `bar` glass capsule, top-left-lit `glass.rim`, glass lift (light) | white 70% rim, top 92%, left 84% | cyan rim 20%, top 36%, left 28% |
| Tab selected (icon, caption) | glass accent ink on the glass lens (`glass.selection` + `glass.selectionRim`), caption 600 | `#004D5A` on an ice lens + deep-teal 55% outline | `#26CCE6` on `rgba(0,72,86,0.55)` + cyan 50% outline |
| Tab unselected | glass secondary ink, 500 | `#2F4954` | `#ABBDC7` |
| Ambient glows | `glass.ambient` | cyan 7% top-left + white 60% centre-right | `#0D3843` 18% top-left + `#08313A` 10% centre-right |

### 3.2 Scoring screen

| Element | Token | L | D |
|---|---|---|---|
| Score figure `142/4` | `score` | `#061A20` | `#F8FCFD` |
| Overs `16.4` | `textPrimary` | `#0B232B` | `#F2F7F9` |
| "of 20", "ov" | `textMuted` (on solid content) | `#526B77` | `#7F97A3` |
| Rates labels (`CRR`) / values | `textSecondary` / `textPrimary` | – | – |
| Band rule (`BoundaryRule tone="band"`, if used) | 2 px `accentDeep` + 1 px `border` | `#007385` + `#D5E0E6` | `#008BA3` + `#1A2A33` |
| Striker row | `accentSubtle` bg, `accent` bar and ▶ | `#DCEFF3` / `#00606F` | `#0A2C36` / `#00C2E0` |
| FREE HIT pill | `warningSubtle` bg, `warning` text | `#FBEFDA` / `#8A5000` | `#2A2014` / `#FFB74D` |
| Pad well (edit ball only; on the live screen the dock is the well) | `surfaceSunken` | `#E2EBF0` | `#04090C` |
| Run key face / border / digit | `surface` / `borderStrong` / `score` | `#FFFFFF` / `#6E848E` / `#061A20` | `#0D171C` / `#5A7482` / `#F8FCFD` |
| Run key pressed | `accentSubtle` | `#DCEFF3` | `#0A2C36` |
| WICKET key border + label | `danger` | `#C42B2B` | `#FF5252` |
| WICKET key pressed | `dangerSubtle` | `#FCE8E8` | `#2D1316` |
| Live score band (top) | `bar` glass under the score (`GlassBar`); inks `score`, `textPrimary`, glass secondary, glass accent | `rgba(252,254,255,0.60)` | `rgba(15,27,34,0.70)` |
| Scoring dock (action row + pad), the strongest glass | `dock` glass, 24 pt top corners, the dock's stronger lit top rim | `rgba(252,254,255,0.66)`, rim top white 94% | `rgba(15,27,34,0.76)`, rim top `rgba(40,217,242,0.50)` |
| Action row icons + labels (on the dock) | `textPrimary`; disabled controls may use `textMuted` with the disabled state (WCAG exempts them); nothing that carries information is `textMuted` on glass | – | – |
| Six emphasis | the new score digits show in `accent` for 400 ms; never `highlight` | `#00606F` | `#00C2E0` |
| Pending-action panel | Replaces the pad inside the dock; its rows keep solid `surface` faces | `#FFFFFF` | `#0D171C` |

### 3.3 Ball chips (DESIGN_SYSTEM §6.3)

| Kind | Fill | Border | Text | L sample | D sample |
|---|---|---|---|---|---|
| dot | – | `border` | `textMuted` | ring `#D5E0E6`, text `#526B77` | ring `#1A2A33`, text `#7F97A3` |
| runs | – | `borderStrong` | `textPrimary` | `#6E848E` / `#0B232B` | `#5A7482` / `#F2F7F9` |
| four | – | 2 px `accent` | `accent` | `#00606F` | `#00C2E0` |
| six | `accentDeep` | – | `onAccent` | `#007385` / `#FFFFFF` | `#008BA3` / `#010B0E` |
| wicket | `danger` | – | `onDanger` | `#C42B2B` / `#FFFFFF` | `#FF5252` / `#1C0506` |
| wide, no_ball | – | dashed `borderStrong` | `textSecondary` | `#6E848E` / `#3D5864` | `#5A7482` / `#8FA7B3` |
| bye, leg_bye (capsule) | – | `borderStrong` | `textSecondary` | same | same |
| free-hit bar | `warning` | – | – | `#8A5000` | `#FFB74D` |
| placeholder | – | dotted `border` | – | `#D5E0E6` | `#1A2A33` |

The dot ring (`border` on `surface`, 1.34:1 / 1.23:1) is intentionally faint. It is decorative because the "0"/"•" text carries the meaning at ≥ 5.6:1. The boundary entrance ring is `accent` at most 60% opacity and fades to nothing; no chip is ever painted in `highlight`.

### 3.4 Lists, tables, forms

| Element | Token |
|---|---|
| Row background / pressed | `surface` (`surfaceElevated` inside sheets and dialogs) / `surfaceSunken` |
| Row separators | `border` hairline, snapped to a whole pixel, one 16 pt inset |
| Team monogram | `accentSubtle` fill, `accent` code in Barlow Condensed, grows from 40 wide |
| Radio / checkbox / chip / option tile, selected | `accent` mark (dot or check) + 2 pt `accent` outline + 600 label on `accentSubtle`; unselected 1 pt `borderStrong` |
| Section header text | `textSecondary` |
| Table header text | `textSecondary`; body numbers `textPrimary` |
| Highlight row (own team, current bowler) | `accentSubtle` + `accent` bar |
| Withdrawn / eliminated team names | `textMuted` (always with a text badge) |
| Input background / border / focus | `surface` / `borderStrong` / 2 px `accent` |
| Input error | 2 px `danger` + `danger` message |
| Placeholder | `textMuted` |
| Segmented track / selected | `control` glass (`rgba(232,240,244,0.64)` / `rgba(11,20,25,0.70)`) / `glass.selection` lens + 1.5 pt glass-accent outline + check + 600 label |
| Top tabs row | `bar` glass strip with a hairline bottom edge; 3 pt glass-accent underline on the selected tab, edge fades when the row overflows |
| Switch on track / knob | light `accent` + white knob; dark `accentDeep` + `inverseSurface` knob |
| Switch off track / knob | `borderStrong` + `surface` (light) / `inverseSurface` (dark) knob |
| Disabled button | text: transparent + `textMuted`; outlined: transparent + `border` outline; filled: `surfaceSunken` (light) / `surfaceElevated` (dark) + `textMuted` |
| Section rule / live band rule | `border` hairline / 2 pt `accentDeep` + 1 pt `border` |

### 3.5 Overlays and feedback

| Element | Light | Dark |
|---|---|---|
| Bottom sheet, dialog | `sheet` glass `rgba(252,254,255,0.88)`, sheen, white rim inside a 1 px cyan edge; dialog, floating and side sheets with the glass lift | `sheet` glass `rgba(9,17,22,0.82)`, cyan rim lit top-left, no shadow; in-sheet rows on `surfaceElevated` |
| Menus (`ChoiceSheet`), player sheets | sheet glass, as above | sheet glass, as above |
| Scrim | `glass.scrim` `rgba(6,26,32,0.40)` (reduced: 0.52) | `rgba(2,7,9,0.60)` (reduced: 0.76) |
| Toast | `popover` glass `rgba(252,254,255,0.86)` + lift, text and icon `textPrimary #0B232B`, action `accent #00606F` | `popover` glass `rgba(17,30,37,0.90)` + cyan rim, text `textPrimary #F2F7F9`, action `accent #00C2E0` |
| FAB | pill `bar` glass + lift, glass accent icon and label (`#004D5A`) | pill `bar` glass + cyan rim, glass accent icon and label (`#26CCE6`) |
| Warning banner | `warningSubtle` + 3 px `warning` bar, text `textPrimary` | same tokens |
| Danger banner | `dangerSubtle` + 3 px `danger` bar | same tokens |
| Skeleton | `surfaceSunken` | `surfaceSunken` (`#04090C` on `#070E12`): subtle but visible |
| Focus ring | `focusRing #008BA3` | `focusRing #28D9F2` (the attention cyan) |

### 3.6 Badges

| Badge | Light | Dark |
|---|---|---|
| Live | `accentSubtle` / `accent` | `#0A2C36` / `#00C2E0` |
| Qualified | `successSubtle` / `success` | `#0B2A22` / `#35D49A` |
| Manual Override, Paused, Provisional-warning | `warningSubtle` / `warning` | `#2A2014` / `#FFB74D` |
| Needs repair | `dangerSubtle` / `danger` | `#2D1316` / `#FF5252` |
| Neutral (Scheduled, In contention) | outline `borderStrong`, text `textSecondary` | same tokens |

## 4. Chart theming (§67 "charts", `src/ui/charts`)

Charts use `react-native-gifted-charts` wrapped by `WormChart`, `ManhattanChart` and `PartnershipBars`. The wrappers take tokens, never hex. Charts are content: they sit on solid `surface`, never on glass.

| Role | Token | Light | Dark |
|---|---|---|---|
| Series 1: side batting first | `chartSeries1` (cyan) | `#0A96B2` | `#19A2BE` |
| Series 2: side batting second | `chartSeries2` (muted violet) | `#6650B8` | `#7A64D6` |
| Gridlines (horizontal only) | `chartGrid` | `#E1E9ED` | `#16242B` |
| Axis line / ticks | `border` | `#D5E0E6` | `#1A2A33` |
| Axis labels, values, legend text | `textSecondary` (`footnote`, tabular) | `#3D5864` | `#8FA7B3` |
| Chart background | `surface` (charts sit on the page surface, no card) | `#FFFFFF` | `#0D171C` |
| Wicket markers | `textPrimary` dot 10 px with a 2 px `surface` ring + "W" label in the app's Inter, drawn as views (`customDataPoint` / `dataPointLabelComponent`), never SVG text (which falls back to a serif) and never a pressable SVG circle (whose responder props leak to the DOM on web) | – | – |
| Powerplay band | `surfaceSunken` vertical band behind the powerplay overs + `label` "PP" | – | – |

Rules (from the dataviz method; the palette was validated with its checker):
- **Two series maximum, cyan + muted violet, no rainbow, no green.** Innings are the only categorical identity in match analytics; green is the success signal (§107) and never a team. The pair passed the validator in both themes: lightness band, chroma floor, CVD separation (worst adjacent ΔE 14.6 light / 12.4 dark, deutan), normal-vision floor (19.7 / 18.8), contrast ≥ 3:1 against the surface and the page. Violet series 2 is darker than series 1 in both themes so the pair also separates by lightness.
- **One colour per team everywhere.** The worm, the Manhattan and the partnership bars use the same series for the same side: `PartnershipBars series={index}` draws the second innings in `chartSeries2`.
- **Axis edges.** The worm keeps 12 pt of plot inside each end (`WORM_EDGE_SPACING`) so the "0" and last over labels are never clipped.
- **Never colour alone.** Series 2 is drawn **dashed** (6 on / 4 off) in the worm; in Manhattan the two innings are separate small multiples (stacked, same y-scale), each titled with the team short name. Lines carry direct end labels (team short name) plus a legend.
- **Thin marks.** Lines 2 px; bars have a 4 px top radius, 2 px gaps and a baseline anchor; markers at least 8 px.
- **Text is never series-coloured.** Labels and values use text tokens.
- **One y-axis** (runs). No dual axes.
- **Status colours are not used in charts.** Wickets use the ink dot plus "W", not red; series 2 is not the `success` value.
- **Table view.** Each chart has a "Show as table" toggle (ACCESSIBILITY.md §8).
- **Tooltips.** Tapping a bar or point shows a small `surfaceElevated` callout: "Over 17 · 9 runs · 1 wicket". Selection is shown with a 2 px `textPrimary` outline, not a colour change.
- **Dark theme** uses its own series steps (above), validated against the dark surface, not the light values.

## 5. PDF theming (§83, WP-export)

The PDF is a printed scorecard: it is always **light, ink on white**, independent of the app theme (WP-export acceptance: "light print styling independent of app theme"). The HTML builders in `src/export/pdf` embed their own CSS. They do not import `src/ui` tokens (export must not depend on UI), so the print palette is duplicated as constants in `src/export/pdf/styles.ts`. It stays print-friendly and neutral; only the accent follows §107.

| Print token | Value | Use |
|---|---|---|
| paper | `#FFFFFF` | Page |
| ink | `#1A1C19` | All text, rules |
| inkSecondary | `#474E49` | Meta lines, column headers |
| rule | `#1A1C19` 0.75 pt / hairline `#B7C2C8` 0.5 pt | Boundary rule / row separators |
| accent | `#00606F` deep teal (7.23:1 on white; prints as a dark grey in greyscale) | Title rule, "Winner" mark, champion box only |
| band | `#EEF3F5` | Alternate over-summary rows (the only zebra, for scanning printed rows) |

- **Type.** CSS `font-family: 'Inter', -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif` for text and `'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif` for the score figures, with `font-variant-numeric: tabular-nums` on every table. Fonts are not embedded by default, because `expo-print` renders through the OS web view, which cannot see the app's bundled fonts. If the builders later accept base64 `@font-face` data supplied by `ExportService`, they may embed Barlow Condensed 600 only (numerals).
- **Page.** A4 portrait, margins 14 mm; `@page` running footer "Scorebook · <match title> · page n of m"; tables use `break-inside: avoid` per innings block; headers repeat on page breaks (`thead { display: table-header-group }`).
- **Layout.** Title block (match title 18 pt bold, result 12 pt, then toss / venue / date 9 pt), then per innings: batting table, extras + total with a 0.75 pt double rule, did not bat / absent, FoW line, bowling table, partnerships, over summary (a grid of ball tokens in text, with W in bold, the dashed box drawn as a 0.5 pt dashed border), then tournament standings (tournament matches). Base size 9 pt; tables 8.5 pt.
- **Colour independence** holds in print: wickets are **bold W**, fours and sixes are text tokens, and grey-scale printing loses nothing.
- **Tournament PDF** (§82): cover (name, season, champion), final standings per pool with qualification text, results list, bracket drawn as a table of rounds, records.
- **In-app PDF preview** (if shown before sharing) sits on the `background` of the current theme. The page itself stays white.

## 6. Testing the themes

- Snapshot every primitive in both themes (RNTL + `ThemeProvider` forced to light/dark).
- The contrast unit test iterates over the pair list in DESIGN_SYSTEM §1.3 using the same WCAG formula. It fails below the listed requirement or when a value drifts from the documented ratio.
- The token test pins every documented hex, checks that the accent family (`accent`, `accentPressed`, `accentDeep`, `accentSubtle`, `focusRing`, `highlight`, `chartSeries1`) stays in the cyan-teal hue band, that only `success` is green (`chartSeries2` is a 240–270° violet), and that the glass inks keep AA on the 0.70 / 0.60 bars. The adversarial design test rejects neon (fully saturated at full brightness) and any chroma above 0.7 outside the cyan identity.
- The glass test (`src/ui/theme/__tests__/glass.test.ts`) runs the blur-aware model (§2.4) for every level, ink, renderer mode and lens state, the opaque twins and the ambient-lit page; pins the §107 dark glass RGB and rim; proves the reference alpha 0.70 would fail; checks that the dock is the strongest glass and that the rim is lit top-left; and checks the light/dark character rules (white rims and a faint cyan edge in light; deep hued tint with cyan rims in dark).
- The glass component test checks that the rim renders with a brighter top and left edge, that the dock uses its own rim, and that `AmbientBackground` draws two radial glows, keeps them under Reduce Transparency and drops them under high contrast.
- Manual glass check: scroll a scorecard and the history list under the top bar and tab bar on an iOS 26 device, an older iPhone, an Android phone and the web build, in both themes, with Reduce Transparency on and off. Visual QA shots of the §107 retheme are in `.workflow/wave3/shots-retheme/`.
- Manual outdoor check: score a mock over at maximum brightness in direct sun in light theme, and at minimum brightness at night in dark theme. Record the pass or fail in the QA sheet.
