# Scorebook — Responsive Strategy

Spec: §72 (outdoor), §74 (responsive), §78 (dynamic type). Layouts reference [WIREFRAMES.md](WIREFRAMES.md), and the size tokens are in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 1. Principles

1. **The scoring pad is anchored to the bottom safe area on every size.** Extra height is given to the top of the score block and to key height, never used to push the pad upwards.
2. **Tablets get a different layout, not a stretched phone** (§74). Width ≥ 768 dp switches to two panes where it adds information (scoring, tournament dashboard, standings, fixtures). Other screens use a centred column with a maximum width.
3. **Content decides, not device names.** Breakpoints use the window size from `useWindowDimensions()`, not device detection, so split-screen, foldables and Stage Manager behave correctly.
4. **Nothing is removed on small screens except redundancy.** On a 320 pt phone, secondary information moves into sheets. The score, overs, batters, bowler, over sequence and all eight keys remain.

## 2. Breakpoints

Width classes (dp/pt of the **window**):

| Class | Width | Examples | Layout |
|---|---|---|---|
| `compact-s` | < 360 | iPhone SE (1st gen) 320, small Android 320–359 | Compact phone rules (§3) |
| `compact` | 360 – 599 | Most phones (360, 375, 390, 393, 412, 430) | Base phone design (all wireframes) |
| `medium` | 600 – 767 | Large foldables unfolded in portrait, small tablets, phone landscape | Phone layout, content column max 560 centred; live scoring phone layout with keys max 96 wide |
| `expanded` | ≥ 768 | iPad (768/810/820/834 portrait), Android tablets, any landscape tablet | **Two-pane** where specified (§4) |

Height classes (for the live scoring screen only):

| Class | Window height | Key height | Score size | Notes |
|---|---|---|---|---|
| short | < 600 | 56 | `scoreHero` 52 | Removes the 4s/6s line and the "THIS OVER" label |
| regular | 600 – 800 | 64 | 64 | – |
| tall | > 800 | 72 (up to 80 with spare space) | 64 | Spare space goes above the score block, max 32 |

The `useLayoutClass()` hook in `src/ui` returns `{width: 'compact-s'|'compact'|'medium'|'expanded', height: 'short'|'regular'|'tall', isLandscape}`. Feature screens branch on this, not on raw numbers.

## 3. Small phones (320 pt wide)

Measured against a 320 × 568 window (WIREFRAMES W-S1b):

| Element | Change at `compact-s` |
|---|---|
| Gutter | stays 16 (content width 288) |
| Scoring keys | width = (320 − 32 − 24) / 4 = **66**, height 56. Labels: digits at `scoreKey` 32; EXTRAS/WICKET `keyLabel` at 13 with the icon above (the words still fit: "WICKET" at 13 pt Inter 700 ≈ 52 pt wide) |
| Score block | `scoreHero` 52; team label abbreviated to the short name ("PAK XI · 2ND INNS") |
| Rates | One line: requirement + RRR; CRR moves to the scorecard |
| Batters | Rows 40 tall; the 4s/6s line is removed (it lives in the batter sheet) |
| Bowler | Figures only; ECO moves to the bowler sheet |
| Over strip | `lg` chips kept at 32 (legibility); strip scrolls horizontally when an over has more than 7 deliveries |
| Action row | Undo · Swap · More (Redo moves into More → Redo) |
| Top bar title | Team short names only ("PAK v LIO") |
| Sheets | Full width, max height 94% |
| Tables | Standings: the NRR column stays; a "Form" or "T" column moves to a horizontal scroll area. Scorecard: SR stays, 4s/6s scroll |
| Wizards | Footer buttons stack vertically when the labels would truncate |
| Segmented controls | Three or more segments with long labels switch to a picker row ("Method: Random ▾") |

**No horizontal page scroll anywhere.** Only tables and over strips scroll horizontally, each inside its own container with a sticky first column (tables).

## 4. Tablet two-pane layouts (`expanded`)

| Screen | Left pane | Right pane | Split |
|---|---|---|---|
| **Live scoring** (§74) | Live scorecard (batting, bowling, FoW, recent overs) | Scoring column (score block, batters, bowler, strip, actions, pad). Sheets open **inside this pane** | left `flex: 1` (min 360), right fixed 420 (portrait 768–1023) or 440 (≥ 1024). Divider: hairline |
| Scorecard (completed) | Innings 1 | Innings 2 (super overs as tabs over the right pane) | 50 / 50 |
| Tournament dashboard | Dashboard sections (current stage, next/live, recent) | Standings for the current stage (pool tabs) | 45 / 55 |
| Standings | Table | Explanations + tie-break notes + qualification list | 60 / 40 |
| Fixtures | Fixture list | Fixture detail of the selected row (master–detail; on phones this is a push) | 40 / 60 |
| Pools | All pools as columns (one column per pool, 240 min, horizontal scroll beyond 4) | Impact sheet opens as a right-side panel instead of a bottom sheet | – |
| History | Match list | Scorecard of the selected match | 40 / 60 |
| Wizards, Settings, Teams | Single column, max width 640, centred | – | – |

Behaviour:
- Two-pane screens keep **one navigation stack**. Selecting in the left pane replaces the right pane's content; Back pops the stack as on phones.
- Pane minimums: when the window is resized below 768 (split view), the layout collapses to the phone layout **without losing state**. The scoring store is independent of layout.
- Scoring keys on tablets: 80 tall, max 104 wide. The pad never exceeds the right pane's width, so the thumb reach stays the same as on a phone held in two hands.
- `scoreHero` is 72 in the tablet scoring pane. Tables use `tableNumeric` at 16.

### 4.1 Orientation

`app.json` currently sets `"orientation": "portrait"`, which locks **all** devices, tablets included, to portrait. §74 asks for optional landscape, and a landscape tablet is the natural two-pane posture.

- **Recommendation (needs an `app.json` change by its owner):** `"orientation": "default"`, with iPad multitasking support left on. Phones continue to use the portrait design. If a phone is rotated, the `medium` landscape layout (WIREFRAMES W-S13) applies on the live scoring screen, and other screens reflow as a centred column.
- Until that change, tablets run portrait only, and the two-pane layout applies at ≥ 768 dp portrait (iPad mini 744 pt stays on the phone layout).
- Rotation never re-creates the scoring store or loses a pending sheet. Sheets re-anchor to the new pane.

## 5. Dynamic type and font-scaling caps (§78)

Text honours the OS font scale (`allowFontScaling` on). Caps (`maxFontSizeMultiplier`) prevent layouts that are already large from breaking. The caps are set per variant in `src/ui/typography`:

| Variant group | Cap | Rationale |
|---|---|---|
| `scoreHero`, `scoreLarge` | **1.0** | Already 40–72 pt, far above the largest accessibility body size. Screen-reader and zoom users still get them through the accessibility label. They scale only through the layout-class sizes |
| `scoreKey`, `keyLabel` | **1.2** | Key size is fixed by the grid; 1.2 × 32 fills the key without clipping |
| `scoreMedium`, `figure`, `figureSmall` (ball chips) | **1.3** | Chips grow in width only (rectangles) or move to `md` size in the strip |
| `title1`, `title2`, `headline` | **1.6** | Titles wrap to two lines, then truncate with an ellipsis |
| `body`, `bodyStrong`, `callout`, `subhead`, `footnote` | **2.0** | Full dynamic type. Rows grow in height, and lists are virtualised with dynamic row heights |
| `label` (uppercase), `tableNumeric` | **1.5** | Tables switch to horizontal scroll with a sticky first column above font scale 1.3 |

Layout responses to large text (font scale ≥ 1.3):
- Two-column forms (Season / Organizer) stack to one column.
- Dialog actions stack vertically.
- Batter rows on the live screen move the balls "(24)" to a second line.
- The live screen's rates line wraps to two lines; the score block grows. If the total no longer fits a `regular` height, the batters/bowler block becomes scrollable **between** the fixed score block and the fixed pad (the pad is never pushed off-screen).
- The tab bar labels stay at 12 × 1.5 max; icons keep the item identifiable.

## 6. Touch targets and spacing across sizes

| Control | Minimum | Scoring area |
|---|---|---|
| Any tappable element | 44 × 44 (hitSlop if visually smaller, §72) | – |
| Scoring keys | – | 56 (short) / 64 / 72 / 80 (tablet) tall; ≥ 66 wide |
| Sheet choice buttons (dismissals, extras chips, bowlers) | 56 tall | ≥ 96 wide |
| Gap between adjacent scoring targets | 8 | 8 (prevents 3 → 4 mis-taps) |

## 7. Safe areas and system UI

- `react-native-safe-area-context` insets apply to the top bar, the tab bar, sticky footers and the scoring pad (bottom inset added under the pad, pad background extends into it).
- Tab bar (DESIGN_SYSTEM §6.6): one docked glass surface whose glass runs down into the bottom inset, so nothing of the page shows below it. Its row is 60 pt above the inset whatever the navigation mode: 94 pt footprint on iOS (34), 84 with Android gesture navigation (24), 108 with the Android 3-button bar (48), 68 with no inset (8 pt floor). `TabChrome` publishes the row height (60, or 68 without an inset) as bottom chrome, so every tab screen pads its last item and its FAB clear of the bar and the height never changes between screens. The row is centred at most 520 wide on tablets; side padding is 16 (8 below 360 wide) plus any landscape side inset.
- Android gesture navigation: the bottom 16 pt above the inset is kept free of tappable keys by the pad's bottom padding (12) plus the inset.
- Keyboard: `Screen` is keyboard-aware (`src/ui/layout/keyboard.tsx`). On iOS the scroll view insets itself (`automaticallyAdjustKeyboardInsets`); on Android (edge-to-edge in SDK 57, so `adjustResize` is never relied on) the content is padded by the keyboard height. On Android the overlap is measured from the bottom of the edge-to-edge window: React Native reports the keyboard height above the system bar, so the bottom safe-area inset is added back. In both, a glass footer dock rides on top of the keyboard and the focused field is scrolled between the header and the keyboard plus dock with as little scrolling as possible: a 24 pt margin while there is room, shrinking to nothing on small screens; if the whole field (label, box, helper) does not fit, the input box itself is revealed. The scroll is computed from the offset the scroll view reports, never a predicted one, so a second reveal while the first is still animating cannot overshoot under the header. `KeyboardGroup` lets a form reveal its primary action together with the focused field when both fit. `useFormChain` moves Return/Next to the next field and, on Android, re-opens the keyboard if a Return key event hid it during the move; inside a `Sheet` or `Dialog`, `TextField autoFocus` focuses once the overlay has finished opening so Android shows the keyboard. `Sheet` and `Dialog` rise above the keyboard and shrink to the space it leaves. The tab bar is hidden behind the Android keyboard and keeps its height. The scoring screen never shows a keyboard except in the "Custom" numeric fields inside sheets, where the sheet rises with it.
- Status bar: translucent on Android; content starts below the inset.

## 8. Testing matrix

| Size | Device / emulator | Orientation | Must pass |
|---|---|---|---|
| 320 × 568 | iPhone SE (1st gen) simulator / Android 320 dp AVD | portrait | W-S1b layout, all 8 keys visible without scrolling, no truncated key labels |
| 360 × 640 | Android small (e.g. Galaxy A-series) | portrait | Base layout, keys 64 |
| 390 × 844 | iPhone 14/15 | portrait | W-S1 reference |
| 430 × 932 | iPhone Pro Max | portrait | Tall layout, keys 72–80 |
| 412 × 915 | Pixel 7 | portrait + landscape (after the orientation change) | W-S13 |
| 768 × 1024 | iPad 9th gen | portrait | Two-pane scoring at the minimum |
| 1180 × 820 | iPad Air | landscape | W-S12 reference |
| 800 × 1280 | Android tablet | both | Two-pane layouts |
| Font scale 2.0 | any compact phone | portrait | §5 behaviours; pad visible |
