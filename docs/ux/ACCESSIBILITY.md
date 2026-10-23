# Scorebook — Accessibility Strategy

Spec: §78 (screen readers, labels, dynamic type, high contrast, reduced motion, colour independence), §72 (outdoor use, targets), §106 (glass legibility, Reduce Transparency), §107 (Cyber-Cyan palette), §86 (human error messages), §98 (explained automation). The target is **WCAG 2.2 AA** plus the platform guidelines (iOS VoiceOver, Android TalkBack). Tokens and components are in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), and sizes in [RESPONSIVE.md](RESPONSIVE.md).

Scorebook's users include scorers in bright sun, older club officials with large text, colour-blind players, and blind or low-vision organizers who run tournaments with a screen reader. **A blind scorer should be able to score a full match with VoiceOver or TalkBack.** That is the bar for the live scoring screen.

## 1. Principles

1. **The domain speaks; the UI does not invent words.** Spoken strings for balls, dismissals, results and qualification come from the domain: `BallToken.accessibilityLabel`, `DismissalRecord.text`, `resultText`, `TeamQualification.explanation`, `SlotResolution.explanation`, `ServiceError.message`. The UI adds only role and position context.
2. **Every state has text.** Colour, shape, weight and icons reinforce the meaning; the text *is* the meaning (§78 "WICKET + icon + text, not just red").
3. **Nothing important is gesture-only** (§72). Swipes and long-presses are shortcuts that duplicate a visible control.
4. **Announce outcomes, not keystrokes.** After a ball is committed, one concise announcement describes what happened and the new score.

## 2. Labels and roles

Every interactive element has `accessibilityRole` and `accessibilityLabel`. `IconButton` makes `accessibilityLabel` a required prop in its TypeScript type, so a missing label is a compile error.

| Element | Role | Label | Hint / state |
|---|---|---|---|
| Run key `0` | `button` | "Dot ball" (or "Zero runs") | – |
| Run keys `1`–`3` | `button` | "One run", "Two runs", "Three runs" | – |
| `4` / `6` | `button` | "Four runs, boundary" / "Six runs, boundary" | – |
| EXTRAS | `button` | "Extras" | "Wide, no ball, byes, leg byes and other runs" |
| WICKET | `button` | "Wicket" | "Opens dismissal options" |
| Undo | `button` | "Undo last ball" (or "Undo: Ali Khan, bowled" when the last group is known) | disabled: "Nothing to undo" |
| Redo | `button` | "Redo: four runs" | – |
| Swap | `button` | "Swap strike" | disabled when a batter bats alone |
| More | `button` | "More scoring actions" | – |
| Score block | `header` (text, not a button on phones) | "Pakistan XI, 142 for 4, 16.4 overs of 20. Need 43 from 20 balls. Required rate 9.12." | – |
| Batter row | `button` | "On strike: Ali Khan, 42 runs from 24 balls" / "Non-striker: Ahmed Shah, 31 from 27" | "Opens batter options" |
| Bowler row | `button` | "Bowling: Hassan Ali, 3.4 overs, 0 maidens, 28 runs, 2 wickets" | – |
| Over strip | `text`, grouped | "This over: one, four, dot, wicket, wide, two. 2 balls left. 7 runs." (chip labels joined, from the domain) | – |
| Ball chip in the ball log | `button` | "Over 17 ball 2: Four runs, Hassan Ali to Ali Khan" | "Edit this ball" |
| Segmented option | `radio` | option text | `selected` |
| Tab | `tab` | "Pool A" | `selected`; "1 of 4" |
| Bottom tab | `tab` in a `tablist` | "History" | `selected`; "3 of 4". The liquid canvas and the fade are hidden from the reader. While the Android keyboard is up the bar is hidden from the reader and from touch, and it returns unchanged |
| Switch row | `switch` | row title | `checked` |
| Stepper | `adjustable` | "Overs, 20" | increment / decrement actions |
| Standings row | `text` (or `button` when tappable) | "Position 1, Tigers, played 3, won 3, lost 0, no result 0, 6 points, net run rate plus 1.234. Qualified, mathematically." | – |
| Badge | part of its row label | e.g. "Manual Override" | – |
| Progress rules (tournament, wizard) | hidden (`importantForAccessibility="no"`) | – | The adjacent text ("24 of 48 played", "Step 3 of 5") is read instead |
| Decorative glyphs (▶, ◉, boundary rule, grabber) | hidden | – | Their meaning is inside the row label |

Numbers are spoken naturally: "142 for 4" (not "142 slash 4"), "16.4 overs" as "16 point 4 overs", NRR "plus 1.234". A small `speakable` helper in `src/features/scoring` builds these strings from domain values, and the domain's `accessibilityLabel` is used as is.

## 3. Live regions: announcing score changes

The live scoring screen keeps one polite live region (`accessibilityLiveRegion="polite"` on Android; `AccessibilityInfo.announceForAccessibility` on iOS), fed by the store after every **committed** action:

| Event | Announcement |
|---|---|
| Runs | "{BallToken label}. {Team} {runs} for {wickets}, {overs} overs." e.g. "Four runs. Pakistan XI 146 for 4, 16.5 overs." |
| Odd runs / end of over strike change | Appended: "Ahmed Shah on strike." |
| Wicket | "Wicket. Ali Khan, caught Rizwan bowled Hassan Ali, 42. Pakistan XI 146 for 5. Shoaib Malik comes in." (dismissal text from the domain) |
| Extras | "Wide, plus one run. 148 for 5." |
| Free hit next | Appended: "Next ball is a free hit." |
| End of over | "End of over 17. 9 runs from the over. Choose the bowler for over 18." |
| Innings complete | "Innings complete, overs completed. Lions 184 for 6. Pakistan XI need 185." |
| Result reached | "Pakistan XI won by 5 wickets with 12 balls left. Confirm result to finish." |
| Undo | "Undone: four runs. Pakistan XI 142 for 4, 16.4 overs." |
| Save failed | **Assertive**: "Couldn't save this delivery. Your previous match data is still safe." |
| Pending prompt opened | Focus moves to the panel title (§4), and the title is read. No duplicate announcement |

Rules:
- Announcements are **queued and never overlap** (the next one waits about 50 ms after the previous finishes; iOS `announcementFinished` event). A rapid second ball replaces a queued but unspoken announcement for the first, so the score heard is always current.
- Toasts are announced politely, error toasts assertively.
- **Where it is built (wave 2):** the store does not announce. The scoring screen mounts one `CommitAnnouncer` (`src/features/scoring/hooks/useCommitAnnouncer.ts`) that compares the previous and the new `LiveMatch` and calls `AccessibilityInfo.announceForAccessibility` only when `lastSeq` grows in the same match. The text comes from `selectors/announce.ts`: the domain `BallToken.accessibilityLabel`, the batter and the domain dismissal text for a wicket, the score and overs, "End of over N. X runs from the over." and "Next ball is a free hit.". Opening a match announces nothing. An undo is announced once, through its toast ("Undone: 0.1 · Four"), not a second time by the announcer. The 50 ms queue is not built in V1; the platform's own announcement handling is used.
- Outside scoring, live regions announce only async results: "Pools drawn, seed 847291", "Changes applied", "3 matches found".

## 4. Focus order and focus management

Reading order follows the §73 hierarchy on the live screen: **top bar (Back, title, More) → score block → rates → batters → bowler → over strip → action row (Undo, Redo, Swap, More) → pad (0, 1, 2, 3, 4, 6, Extras, Wicket)**. It is enforced with a flat, source-ordered layout (no absolute positioning that reorders), and with `accessibilityViewIsModal` on sheets.

Focus management:

| Situation | Focus moves to | Returns to |
|---|---|---|
| Sheet or dialog opens | Its title (`accessibilityFocus` via `AccessibilityInfo.setAccessibilityFocus` on the title's node) | The control that opened it |
| Pending-action panel appears (next batter, bowler, innings break, confirm result) | Panel title ("Next batter, replaces Ali Khan") | The `1` key after the panel is resolved, so scoring resumes where the thumb is |
| Ball committed from the pad | Stays on the pressed key (repeated scoring without re-navigating) | – |
| Wizard step change | The step title | – |
| Error on a form submit | The first invalid field (its error message is part of its label) | – |
| Screen push | The top-bar title | – |
| Impact sheet → CONFLICT dialog | Dialog title; "Review again" first | Impact sheet title |

**Focus visibility.** The 2 pt `focusRing` outline is drawn only for keyboard and switch-access focus. Natively, Android also moves focus programmatically (for example back to the row that opened a sheet), so `InputModalityRoot` notes every touch at the app root: a focus that follows a touch draws no ring, and two focus moves in a row without a touch count as keyboard navigation again. On web, `useFocusRing()` tracks the last input modality (navigation keys versus pointer/mouse/touch down, document capture phase): a focus that follows a pointer press draws no ring, and a ring that is showing disappears as soon as the pointer is used. A tapped scoring key, tab or button therefore never keeps a ring that reads as an armed or selected state, while keyboard users still see exactly where they are. Selection indicators (tab underline, segment lens, chip outline) are independent of focus.

Destructive dialogs place initial focus on **Cancel**. Tables expose one element per row (not per cell), so swiping moves row by row. Brackets read round by round, top to bottom: "Semifinal 1: A1 Tigers 172, B2 Pumas 150, Tigers won."

**Screen-reader scoring speed-up:** VoiceOver users can use the rotor "Actions" on the score block: "Score one run", "Score four", "Wicket…", "Extras…", "Undo". The same actions are exposed on Android as `accessibilityActions`. This avoids swiping through the whole screen for every ball. As built, the score block offers every pad key ("Score a dot ball", "Score one run" … "Score six"), then "Extras…", "Wicket…" and "Undo" while the pad is showing, and only "Undo" while a pending or repair panel replaces the pad. Its label is the full §2 summary ("Tigers, 11 for 0, 0.4 overs of 3. Need 8 from 14 balls. Required run rate 12.00."). The activate gesture still opens the scorecard.

## 5. Touch targets (§72)

| Class | Minimum | Implementation |
|---|---|---|
| All controls | **44 × 44 pt** (WCAG 2.5.5 AAA size, iOS HIG) | Real size first: `sm` buttons are 44 tall (web ignores `hitSlop`), icon buttons 44 × 44, segments 40 + 2 slop, chips 40 + 2 slop, stepper buttons 44. `hitSlop` only tops up controls that are already ≥ 40 |
| Scoring pad keys | **56 × 66 minimum, 72 × 82 typical** | DESIGN_SYSTEM §6.2 |
| Scoring-sheet choices (dismissals, fielders, extras chips, bowlers, batters) | **56 tall**, ≥ 96 wide | – |
| Spacing between adjacent targets | ≥ 8 | Prevents mis-taps on the pad |
| Destructive controls | Never adjacent to a frequent control without 16 pt of separation | DISCARD is last in the resume sheet; Delete is in a separate footer section |

The WP-design-system test measures the rendered size (with hitSlop) of every primitive and fails below 44.

## 6. Colour independence (§51, §78)

| Information | Colour cue | Non-colour cue(s) |
|---|---|---|
| Wicket ball | `danger` fill | Letter **W**, **square** shape, spoken "Wicket, caught" |
| Four / six | `accent` ring / `accentDeep` fill | Digit 4/6, ring versus fill, caption "FOUR"/"SIX" on the keys |
| Wide / no-ball | – (neutral) | Letters WD/NB, **dashed rectangle** (not a legal ball) |
| Byes / leg byes | – | B/LB prefix, capsule shape |
| Free hit | `warning` bar | Visible **FH** label under the chip, text "FREE HIT" in the header; ", free hit" in labels |
| Striker | `accentSubtle` row | ▶ marker, leading bar, heavier name weight, "On strike" in the label |
| Current bowler | – | ◉ marker, "Bowling:" in the label |
| Qualified / in contention / eliminated | `success` / neutral / muted | Badge text, section grouping, explanation sentence (§51), check / x glyphs |
| Manual Override | `warning` | Badge text "Manual Override" + pencil icon (§47) |
| Provisional slot | – | Word "provisional" |
| Selected tab / segment | `accent` | 3 pt underline (tab) / lens with a 1.5 pt outline and a check for every option count (segment), weight 600, `selected`/`checked` state (+ `aria-selected`/`aria-checked` on web) |
| Selected bottom tab | `accent` | The liquid droplet around the icon (shape), caption weight 600 versus 500, `selected` state and `aria-selected` on web; the position ("2 of 4") is the hint |
| Selected radio / chip / option tile | `accent` | Filled radio dot or check mark, 2 pt outline, weight 600, `checked` state; single-choice lists are radios, never checkboxes |
| Switch on / off | track colour | Knob position, knob ≥ 3:1 against both tracks, `checked` state |
| Chart series | series colours | Dashed versus solid line, direct labels, legend, table view (series 2 is violet, never the success green) |
| Errors | `danger` border | Icon + message text; 2 px border (thickness change) |
| Impact changes | – | "+", "−", "~" glyphs, before → after arrows in text |
| Position change in what-if | – | ▲ / ▼ glyph + number |

Verification: every screen is reviewed in the iOS "Grayscale" filter and the Android "Simulate colour space: monochromacy" developer option. **A screen passes only if no information is lost.**

## 7. Contrast and "high contrast" (§78)

- The default palettes already meet **AA for every text/surface pair** (DESIGN_SYSTEM §1.3), with body text at AAA (≥ 7:1) in both themes (light 14.83:1, dark 18.00:1 on the page). There is no low-contrast "muted" text below 4.5:1 (`textMuted` worst case: 4.66:1 on light `surfaceSunken`).
- UI boundaries (inputs, keys, chip outlines) use `borderStrong` at ≥ 3:1.
- **Cyan never carries text in light.** §107 cyan and even the deep teal `#008BA3` fail 4.5:1 on white (4.02:1), so light text, icons and interactive fills use `accent #00606F` (7.23:1 on white). `#008BA3` appears in light only where 3:1 suffices: the focus ring and `highlight` (3.66:1 on the ice page). In dark, `accent #00C2E0` is 9.06:1 on the page and carries dark ink `#010B0E` on fills (9.28:1).
- **Attention colour is rationed.** The bright `highlight #28D9F2` (dark) marks focus, the live indicator and genuine highlights only; routine fours and sixes use `accent` and the deep-teal `accentDeep`, so the colour keeps its meaning when it does appear.
- **iOS "Increase Contrast" / Android "High contrast text"**: when `AccessibilityInfo.isHighTextContrastEnabled()` (Android) or `AccessibilityInfo.isDarkerSystemColorsEnabled()` (iOS "Increase Contrast", subscribed via `darkerSystemColorsChanged`) is on, the theme switches `textSecondary` and `textMuted` to `textPrimary`, `border` to `borderStrong`, and hairlines to 1 pt. There is no separate "high contrast" setting in `AppSettings` today. The OS setting drives it, which is enough for V1 (reported as a possible settings addition).
- Under the system high-contrast setting the glass also renders opaque with a `borderStrong` edge, and the ambient page glows are removed so the page is a plain, flat `background`.
- Bold Text (iOS) / font weight adjustment (Android 12+): Inter 400 → 500 and 600 → 700 via the typography layer.

### 7.1 Contrast on glass (§106, §107)

Text on glass must meet AA (4.5:1; 3:1 for large score figures) against the **worst content that can sit behind it**. Glass blurs, so the worst case is not raw white or black but a bright fill or dense text partly averaged by the blur. `src/ui/theme/glass.ts` models it, and `src/ui/theme/__tests__/glass.test.ts` checks every allowed ink (`GLASS_INKS`) on every level:

1. **Blur radius.** Each level's blur intensity is converted to a Gaussian σ of 0.24 px per unit (100 → 24 px, the §107 frost; the web mapping, the smallest of the platforms, so the model is conservative).
2. **Coverage.** A button-sized block (a 56 px band) keeps `erf(56 / (2√2 σ))` of its colour at its centre (0.757 at σ 24); a 16 px detail (text, icons, chips) keeps `1 − e^(−r²/2σ²)` (0.199).
3. **Backdrops.** Every solid field (page, surfaces, sunken, the four subtle tints, border, chart grid, and the ambient-lit page) is mixed with every bright block (`accent`, `accentPressed`, `accentDeep`, `danger`, both chart series) at block coverage and with every ink at detail coverage, in **both** sRGB and linear light (blur implementations differ). Sheets and dialogs add their scrim.
4. **Layers.** The level tint is composited over each backdrop with and without the sheen, and the minimum contrast wins.
5. **No blur.** Where nothing can blur (Android below 12 or outside the blur target, web without `backdrop-filter`) the denser `unblurred` tint is checked against raw white, raw black and every token instead.
6. **Tab bar liquid.** The droplet (fill at its densest plus the glow) is composited over the bar: the icon ink inside it (`liquid.ink`: glass accent in light, `textPrimary` in dark, because cyan on cyan falls below 3:1) stays ≥ 3:1 as a graphic (WCAG 1.4.11), and the glow stops above the caption, so the glass-accent caption keeps its ≥ 4.5:1 on the bar. An icon the liquid passes over during a tab change is cross-faded to the liquid ink.

7. **Glass inks.** On `bar`, `dock` and `control` glass, secondary/muted and accent text use the glass inks (`glass.ink`), one small step further from the tint than the page inks; the components re-ink their children automatically.

Results (DESIGN_SYSTEM §1.4 has every figure): the binding cases are dark glass-secondary and glass-accent on the bar (4.60 / 4.61:1 blurred), dark `danger` on popovers (4.57:1), light glass-accent on the bar (5.23:1), light `danger` and `textMuted` in sheets (4.57:1). The bars run at the §107 `rgba(15,27,34,0.70)` (dark) and a pale 0.60 white (light) so the glass is perceptible; the test proves that the page `textSecondary` (dark) and page `accent` (light) would fail there and that the glass inks pass. `textMuted` is never used on bars, docks or controls.

**Selection boundaries (WCAG 1.4.11).** A selected segment's outline is ≥ 3:1 against the control track in both themes (8.24:1 light, 9.63:1 dark on the opaque track), a switch knob ≥ 3:1 against its track, and a selected chip or radio carries a 2 pt `accent` outline plus a mark, so selection never depends on a fill difference alone.

**Reduce Transparency** (system, or Settings → Appearance → Reduce transparency) swaps every glass surface for its opaque twin (same RGB): every text token is at least 5.57:1 (light) and 5.32:1 (dark) on them. The ambient page glows are kept, because they are light on the page and not glass: the lit page stays within 1.1:1 of the plain page and every text token stays ≥ 4.5:1 on it.

## 8. Charts and tables

- Each chart (worm, Manhattan, partnerships) has a **"Show as table"** toggle. The table is the accessible representation: over, runs, cumulative score, wickets.
- The chart view has an `accessibilityLabel` summary generated from the data: "Worm chart. Tigers 168 for 7 in 20 overs, Lions 169 for 5 in 18 overs. Lions were ahead from over 14." Summary sentences come from existing domain data (`worm`, `manhattan`). No interpretive text is invented beyond comparing the plotted values.
- Tooltip data is reachable without the chart: tapping a bar is a shortcut, and the table has the same numbers.

## 9. Motor and one-handed use

- The pad is in the bottom thumb zone, with the most frequent keys (0–3) on the top row of the pad (the natural thumb arc) and WICKET at bottom-right.
- **Left-handed layout** (recommended): mirrors row 2 so WICKET is bottom-left. It needs a new `ScoringPreferences.padHand` field, which is not in the contract (reported). Until then, the pad is fixed.
- No double-tap, long-press or swipe is required anywhere. Swipe-to-dismiss sheets always has a Close button; long-press repeat on steppers is optional.
- There is no timing: toasts with actions stay 6 s, and their action is also available elsewhere (Undo in the action row, Redo in More), so a missed toast costs nothing (WCAG 2.2.1).
- Serialised dispatch means rapid taps are never lost, which helps users with tremor who double-tap involuntarily. **Accidental double taps are recorded as two balls**, so Undo is one tap away and the over strip makes the duplicate visible.

## 10. Reduced motion (§75, §78)

- The effective value is `settings.reducedMotion === 'on'`, or `'system'` with `AccessibilityInfo.isReduceMotionEnabled()` (subscribed to `reduceMotionChanged`).
- Behaviour per animation is in DESIGN_SYSTEM §8. In summary: no translation or scale; opacity changes ≤ 120 ms or instant; no looping skeleton; native stack transitions set to `none`.
- Haptics are **not** motion and stay as configured (Vibration setting).

## 11. Dynamic type

See RESPONSIVE.md §5 for caps and reflow. Scores are capped (1.0×) because they are already 40–72 pt. Their full value is in the accessibility label, and the OS zoom and magnifier still work. Body text scales to 2.0×. The live screen keeps the pad on screen at any size by making only the middle (batters/bowler) region scrollable.

## 12. Errors, empty states and language

- Error messages follow §86: what happened, what is safe, what to do ("Couldn't save this delivery. Your previous match data is still safe. [Try again]"). No codes, stack traces or SQL. Technical details are in Diagnostics only.
- Validation messages are attached to their field (`accessibilityLabel` = field label + value + error) and read when focus lands there.
- Language: plain English, organizer-friendly. Cricket terms are used as cricketers say them ("run out", "leg bye", "free hit"). Abbreviations shown on screen (CRR, RRR, NRR, SR, Econ, NR, FoW) are **expanded in accessibility labels** ("current run rate", "required run rate", "net run rate", "strike rate", "economy", "no result", "fall of wickets").
- The app sets `accessibilityLanguage="en"` on text that could be mispronounced (team short names like "LIO" are spoken as the full team name via the label).

## 13. Testing

| Layer | Test |
|---|---|
| Unit (RNTL) | Every primitive: role, label, state (`selected`, `disabled`, `checked`, `busy`), size ≥ 44 with hitSlop; IconButton without a label fails the type check |
| Unit (domain) | `BallToken.accessibilityLabel` for every token in the grammar; dismissal text; result text; qualification explanations never empty |
| Feature (RNTL) | Scoring screen: after `dispatch(scoreRuns(4))` resolves, the announcer receives "Four runs. …"; focus moves to pending panels; the §4 reading order |
| Contrast | Computed test over DESIGN_SYSTEM §1.3 pairs in both themes; the blur-aware glass model (§7.1) over every level, ink, renderer mode and lens; opaque twins; the ambient-lit page |
| Manual | Score a full 2-over match with VoiceOver (iOS) and TalkBack (Android) using the rotor/actions only; run a pool move with impact preview using TalkBack; grayscale review of every screen; font scale 2.0 on a 360 dp phone; Switch Control / Switch Access pass on the scoring pad |
| E2E (Maestro) | Selectors use accessibility labels (`tapOn: "Four runs, boundary"`), which keeps labels stable as a tested contract |
