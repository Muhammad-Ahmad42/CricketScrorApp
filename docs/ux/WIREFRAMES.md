# Scorebook — Wireframes

Phone portrait wireframes for **every route** in [ARCHITECTURE.md §9](../architecture/ARCHITECTURE.md), plus the non-route surfaces from [INFORMATION_ARCHITECTURE.md §4](INFORMATION_ARCHITECTURE.md) and the tablet two-pane live-scoring layout (§74). The tokens, type styles and components named here are defined in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). The flows are in [USER_FLOWS.md](USER_FLOWS.md).

## How to read these frames

- **Scale.** A phone frame is 42 characters wide inside the border, which represents the **358 pt content width of a 390 pt phone** (iPhone 14/15, Pixel 7 class) after two 16 pt gutters, so one character is about 8.5 pt. Heights are not to scale. Real heights are given in each screen's spec table.
- `───` is a hairline separator (full-bleed). `━━━` over `───` is the **boundary rule** (2 px + 1 px, DESIGN_SYSTEM §4.2). `┄┄┄` marks a scroll fold.
- `‹` Back · `✕` Close (wizards) · `⋯` More menu · `›` row chevron · `▾` picker · `[ Label ]` button (the primary one is named in the table) · `( )` segmented or radio option, `(•)` selected · `[x]` checkbox · `○/●` switch off/on.
- Ball chips (DESIGN_SYSTEM §6.3): `(1)` circle run · `(·)` dot · `((4))` four, accent ring · `(●6)` six, filled · `[W]` wicket, filled square · `╎WD╎` `╎NB╎` dashed rectangle (not a legal ball) · `(B1)` `(LB1)` capsule · `( )` placeholder for a legal ball still due · `_` under a chip = free-hit bar.
- `▶` striker marker · `◉` current bowler marker · `|||` stumps glyph on the WICKET key.
- Screen titles, button labels and messages are **final copy** unless shown in angle brackets `<like this>`.
- Numbers shown are examples. Every number on screen comes from domain selectors and `scoring/format` helpers.

## Index

| ID | Route / surface | ID | Route / surface |
|---|---|---|---|
| W-R0 | Root bootstrap states | W-C1 | `match/[id]/scorecard` |
| W-H1 | `(tabs)/index` Home | W-C2 | `match/[id]/balls` |
| W-H2 | Home: first run (empty) | W-C3 | `match/[id]/edit/[seq]` |
| W-H3 | Resume prompt (§23) | W-C4 | `match/[id]/analytics` |
| W-T1 | `(tabs)/tournaments` | W-C5 | `match/[id]/manage` |
| W-Y1 | `(tabs)/history` Matches | W-L1 | `teams/index` |
| W-Y2 | `(tabs)/history` Tournaments | W-L2 | `teams/[teamId]` |
| W-G1 | `(tabs)/settings` | W-N1…N7 | `tournament/new/*` (7 steps) |
| W-M1…M5 | `match/new/*` (5 steps) | W-D1 | `tournament/[id]` Dashboard |
| W-S1 | `match/[id]/score` LIVE SCORING | W-D2 | `…/standings` |
| W-S1b | Live scoring on a 320 pt phone | W-D3 | `…/fixtures` |
| W-S2 | Extras sheet | W-D4 | `…/fixtures/new` |
| W-S3 | Wicket sheet (+ caught, run out) | W-D5 | `…/fixtures/[fixtureId]` |
| W-S4 | Next batter panel | W-D6 | `…/pools` |
| W-S5 | Next bowler panel | W-D7 | `…/stages` |
| W-S6 | Innings break panel | W-D8 | `…/stages/[stageId]` |
| W-S7 | Play suspended panel | W-D9 | `…/qualification` |
| W-S8 | Confirm result panel | W-D10 | `…/bracket` |
| W-S9 | Tied match panel | W-D11 | `…/what-if` |
| W-S10 | More sheet | W-D12 | `…/stats` |
| W-S11 | Needs repair / retirement banners | W-D13 | `…/audit` |
| W-S12 | Tablet two-pane live scoring (§74) | W-D14 | `…/teams` |
| W-S13 | Phone landscape (optional) | W-D15 | `…/manage` |
| W-X1 | `settings/backup` | W-D16 | WHAT WILL CHANGE sheet |
| W-X2 | `settings/presets` | W-X3 | `settings/diagnostics` |

---

## Root

### W-R0 · Bootstrap states (`src/app/_layout.tsx`)

The native splash (`#1F5C3A` with the app mark) stays up while fonts load and `bootstrap()` runs. There is no in-app spinner screen unless bootstrap takes more than 1.5 s. After that, the frame on the left appears (on `background`). A failure shows the frame on the right.

```text
┌────────────────────────────────────┬────────────────────────────────────┐
│                                    │                                    │
│                                    │                                    │
│                                    │ (!)                                │
│           Scorebook                │ Scorebook couldn't open your       │
│                                    │ data                               │
│      Preparing your matches…       │                                    │
│      ────────────                  │ Nothing has been changed. Close    │
│                                    │ other apps and try again.          │
│                                    │                                    │
│                                    │ [        Try again         ]       │
│                                    │                                    │
│                                    │ Technical details ▾                │
│                                    │                                    │
└────────────────────────────────────┴────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| "Scorebook" | `title1`, `textPrimary`, centred at 40% of the height |
| Progress rule | 120 pt indeterminate 2 px line in `accent` (static under reduced motion, with the text only) |
| Error | ErrorState (DESIGN_SYSTEM §6.16). "Technical details" expands `ServiceError.detail` in a monospace `footnote` block with **Copy** |

---

## Tabs

### W-H1 · Home: `(tabs)/index.tsx` (§5, §79)

```text
┌────────────────────────────────────────────┐
│ Scorebook                                  │
│ Good evening                               │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │              +  NEW MATCH              │ │
│ └────────────────────────────────────────┘ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ CONTINUE MATCH                             │
│ Pakistan XI v Lions · T20      ● Live      │
│ Pakistan XI  142/4   16.4 ov   [Resume ›]  │
│ Lions yet to bat                           │
├────────────────────────────────────────────┤
│ RECENT                          See all ›  │
│ Lions v Tigers                  Sat 12 Sep │
│ Lions won by 5 wickets (12 balls left)     │
│ LIO 169/5 (18) · TIG 168/7 (20)            │
├────────────────────────────────────────────┤
│ Hawks v Eagles                  Fri 11 Sep │
│ Match tied - Hawks won the Super Over      │
│ HAW 131/9 (20) · EAG 131/6 (20)            │
├────────────────────────────────────────────┤
│ TOURNAMENTS                     See all ›  │
│ City Cup 2026           Active · 24/48     │
│ Next: Lions v Tigers · Sun 14:00        ›  │
├────────────────────────────────────────────┤
│ School T10 League       Setting up      ›  │
│                                            │
├────────────────────────────────────────────┤
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

| Region | Spec |
|---|---|
| Header | "Scorebook" `title1`; greeting `footnote` `textSecondary` ("Good morning / afternoon / evening" from the injected clock). No avatar, no icons. `AppServices` does not expose its `Clock`, so the hour comes from `src/features/home/clock.ts` (`currentHour()`, replaceable with `setHourSource`); the screen never reads `new Date()` itself |
| NEW MATCH | Button `primary lg` (56), full width, label `keyLabel` "+ NEW MATCH". The only primary button on Home |
| Boundary rule | Separates "act" from "review" |
| Continue Match | Shown only when `useHomeStore.resumable` is non-empty; one block per live/paused match (max 3, then "See all live matches ›"). Line 1 `headline` teams + format + Live/Paused badge. Line 2: team `bodyStrong`, score `scoreLarge` (40), overs `subhead` `textSecondary`, **Resume** `secondary sm`. Line 3 `footnote`: the other side's state ("Lions yet to bat", or the other innings line). `MatchListItem` has no target, so "Need 43 from 20 balls" appears only after opening the match. The whole block is tappable (≥ 56 tall) |
| Recent | Max 3 `MatchListItem`s: title `headline`, date `footnote` right; result line `callout`; score line `subhead` `textSecondary` with tabular numbers. Row → `/match/[id]/scorecard` |
| Tournaments | Max 2 active/draft tournaments: name `headline`, status label + progress `subhead` right (`fixturesDone/fixturesTotal`). The "Next:" line needs next-fixture data that `TournamentListItem` does not carry (see the contract report). Until it does, the second line shows the season and dates. Row → dashboard (drafts → wizard at the saved step) |
| Tab bar | DESIGN_SYSTEM §6.6, Home selected |
| Removed sections | Empty sections are hidden, except the first-run state (W-H2) |

### W-H2 · Home: first run

```text
┌────────────────────────────────────────────┐
│ Scorebook                                  │
│ Good morning                               │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │              +  NEW MATCH              │ │
│ └────────────────────────────────────────┘ │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│                                            │
│ Score your first match                     │
│ Set the overs, pick two teams and start.   │
│ Every ball is saved on this phone as you   │
│ score. No account or internet needed.      │
│                                            │
│ Running a competition?                     │
│ Create a tournament ›                      │
│                                            │
├────────────────────────────────────────────┤
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

Copy per §87. "Create a tournament ›" is a `tertiary` button that pushes `tournament/new`.

### W-H3 · Resume prompt: "MATCH IN PROGRESS" (§23)

A blocking bottom sheet over Home on launch when `findResumable({forPrompt:true})` returns matches. It cannot be dismissed by swipe or scrim. SAVE & EXIT is the dismissal.

```text
┌────────────────────────────────────────────┐
│                                            │
│          (Home, dimmed by scrim)           │
│                                            │
├────────────────────────────────────────────┤
│                   ────                     │
│ MATCH IN PROGRESS                          │
│                                            │
│ Pakistan XI  142/4                         │
│ 16.4 overs · v Lions · T20                 │
│ Last ball saved 14:32                      │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │                 RESUME                 │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │              SAVE & EXIT               │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │                DISCARD                 │ │
│ └────────────────────────────────────────┘ │
│                                            │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Title | `label` "MATCH IN PROGRESS" |
| Score | Team `headline` + `scoreMedium` score; overs line `subhead`; "Last ball saved" `footnote` `textMuted` (`updatedAt`, reassures the scorer that nothing is lost) |
| RESUME | `primary lg` → `/match/[id]/score` |
| SAVE & EXIT | `secondary lg` → `dismissResume` |
| DISCARD | `destructive lg` → confirm Dialog. **Tournament matches:** DISCARD is replaced by the `footnote` "Tournament matches can't be discarded. End or abandon it in Match settings." |
| Several matches | Each match is a row (score + RESUME `secondary sm`); the sheet footer keeps a single SAVE & EXIT |
| Needs repair | Badge "Needs repair" beside the score; RESUME still opens the match (W-S11) |

### W-T1 · Tournaments: `(tabs)/tournaments.tsx` (§82)

```text
┌────────────────────────────────────────────┐
│ Tournaments                     [+ New]    │
│ (•Active)  ( Drafts )  ( Completed )       │
├────────────────────────────────────────────┤
│ City Cup 2026                           ›  │
│ 12 teams · Groups + knockout               │
│ Group stage · 24/48 played                 │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯                   │
├────────────────────────────────────────────┤
│ University T20 Shield                   ›  │
│ 8 teams · League · 3/28 played             │
│ ▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯                   │
├────────────────────────────────────────────┤
│                                            │
│                                            │
│          (Completed segment:)              │
│ Winter League 2025                      ›  │
│ 6 teams · Completed · Champion: Tigers     │
├────────────────────────────────────────────┤
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| "+ New" | `secondary sm` → `tournament/new` |
| Filter | SegmentedControl: Active (`fixtures_generated`, `active`), Drafts (`draft` … `pools_configured`, row subtitle "Step 4 of 7: Pools", tap → wizard `resume`), Completed (`completed`, `archived`; archived rows add "Archived") |
| Row | Name `headline`, season in the name line if set; meta `footnote`; progress line `subhead` "24/48 played". The progress rule is 4 pt high, 50% width, `accent` filled / `border` rest, **decorative** (hidden from accessibility; the text says it) |
| Empty (Active) | EmptyState: "No tournaments yet" / "Create a tournament and manage teams, fixtures, standings and finals in one place." / `CREATE TOURNAMENT` (§87) |
| Empty (Drafts / Completed) | Single line `callout` `textSecondary`: "No drafts." / "No completed tournaments yet." |

### W-Y1 · History: Matches: `(tabs)/history.tsx` (§81)

```text
┌────────────────────────────────────────────┐
│ History                                    │
│ (•Matches)  ( Tournaments )                │
│ ┌────────────────────────────────────────┐ │
│ │ ⌕  Search teams or titles              │ │
│ └────────────────────────────────────────┘ │
│ Status: All ▾   Team: Any ▾   Recent ▾     │
├────────────────────────────────────────────┤
│ SEPTEMBER 2026                             │
│ Lions v Tigers            Sat 12 Sep   ⋯   │
│ Lions won by 5 wickets (12 balls left)     │
│ TIG 168/7 (20) · LIO 169/5 (18)            │
│ T20 · City Cup 2026                        │
├────────────────────────────────────────────┤
│ Pakistan XI v Lions       Thu 10 Sep   ⋯   │
│ ● Live · PAK 142/4 (16.4)                  │
│ T20                                        │
├────────────────────────────────────────────┤
│ Hawks v Eagles            Wed 9 Sep    ⋯   │
│ Match abandoned                            │
│ HAW 44/2 (6.1)                             │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Search | TextField with a leading `search` icon, debounce 250 ms → `load({search})` |
| Filters | Three `tertiary sm` pickers opening sheets: Status (All · Live · Completed · Scheduled · Abandoned · Cancelled), Team (library picker), Sort (Recent · Oldest · Scheduled). Active filters show their value in `accent` |
| Month headers | SectionHeader `label` |
| Row (§81) | Teams `headline` + date `footnote` + ⋯ (IconButton: View scorecard, Export PDF, Delete). Line 2: result line (`formatResult`) or status badge + score for live/paused. Line 3: both innings `subhead` tabular. Line 4: format · tournament `footnote` `textMuted`. Row tap → scorecard (live → score) |
| Paging | `FlatList` with `loadMore` at 70% scroll; footer Skeleton rows while loading |
| Empty | "No matches yet" / "Matches you score appear here with their scorecards." / `NEW MATCH`. With filters: "No matches match these filters." + [Clear filters] |

### W-Y2 · History: Tournaments

```text
┌────────────────────────────────────────────┐
│ History                                    │
│ ( Matches )  (•Tournaments)                │
├────────────────────────────────────────────┤
│ Winter League 2025                      ›  │
│ 6 teams · Completed                        │
│ Champion: Tigers                           │
├────────────────────────────────────────────┤
│ Spring Cup 2025                         ›  │
│ 16 teams · Archived                        │
│ Champions: Lions & Hawks (shared)          │
├────────────────────────────────────────────┤
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

Shows `completed` and `archived` tournaments (§82: name, team count, status, champion). Row → the dashboard in completed mode (final standings, bracket, statistics, match list, export).

### W-G1 · Settings: `(tabs)/settings.tsx` (§5, §70, §76, §77)

```text
┌────────────────────────────────────────────┐
│ Settings                                   │
│ APPEARANCE                                 │
│ Theme                                      │
│ ( Light )  ( Dark )  (•System)             │
├────────────────────────────────────────────┤
│ SCORING                                    │
│ Default format                     T20 ›   │
│ Show dot balls as           (•0) ( • )     │
│ Ask for the bowler at over end       ●     │
│ Confirm before ending an innings     ○     │
│ Keep screen awake while scoring      ●     │
├────────────────────────────────────────────┤
│ FEEDBACK                                   │
│ Vibration                            ●     │
│ Sound effects                        ○     │
│ Not available in this version              │
│ Reduce motion         System ▾             │
├────────────────────────────────────────────┤
│ LIBRARY                                    │
│ Teams & players                        ›   │
│ Format presets                         ›   │
├────────────────────────────────────────────┤
│ DATA                                       │
│ Backup & import                        ›   │
│ Diagnostics                            ›   │
├────────────────────────────────────────────┤
│ ABOUT                                      │
│ Scorebook 1.0.0                            │
│ Your data stays on this phone. No          │
│ account, no tracking, no cloud.            │
├────────────────────────────────────────────┤
│   Home    Tournaments   History  Settings  │
└────────────────────────────────────────────┘
```

| Row | Binding |
|---|---|
| Theme | SegmentedControl → `settings.theme` (applies instantly, §70) |
| Default format | Picker sheet of presets → `defaultFormatId` |
| Dot balls | SegmentedControl `0` / `•` → `scoring.dotStyle` |
| Bowler at over end | Switch → `scoring.autoPromptBowler` |
| Confirm innings end | Switch → `scoring.confirmInningsEnd` |
| Keep screen awake | Switch → `scoring.keepAwake` (expo-keep-awake while `score` is focused) |
| Vibration | Switch → `hapticsEnabled` (§76, §77 wording) |
| Sound effects | Switch **disabled** + helper "Not available in this version" (no audio dependency; see DESIGN_SYSTEM §9) |
| Reduce motion | Picker `System · On · Off` → `reducedMotion` |
| About | Privacy line per §85 |

---

## Match setup wizard: `match/new/*` (§6–§8, §64)

Common chrome: top bar with `✕` Close (left), title, step indicator "Step 2 of 5" (`footnote`) under the title, and a 5-segment progress rule (4 pt, `accent` done / `border` to do). Sticky footer: `[ Back ]` (`secondary`) and `[ Next ]` (`primary`), each half width.

### W-M1 · New match: `match/new/index.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  New match                               │
│    Step 1 of 5   ▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯ │
├────────────────────────────────────────────┤
│ Title (optional)                           │
│ ┌────────────────────────────────────────┐ │
│ │ Pakistan XI v Lions                    │ │
│ └────────────────────────────────────────┘ │
│ FORMAT                                     │
│ (T5)(T10)(•T20)(T30)(T40)(T50)(Custom)     │
│ OVERS PER INNINGS                          │
│ ( 1)( 2)( 5)( 6)(10)(•20)(25)(30)(40)(50)  │
│ Other number  ┌──────┐                     │
│               │   17 │  overs              │
│               └──────┘                     │
│ Date   Sat 12 Sep ▾      Time  14:00 ▾     │
│ Venue  Model Town Ground ▾                 │
├────────────────────────────────────────────┤
│ RULES                        Reset to T20  │
│ Players per side                    11 ›   │
│ Balls per over                       6 ›   │
│ Max overs per bowler                 4 ›   │
│ Wides           1 run, bowled again   ›    │
│ No-balls        1 run, free hit       ›    │
│ Powerplay       Overs 1-6             ›    │
│ Super over      Off                   ›    │
│ Last man stands Off                   ›    │
│ Mandatory retirement   Off            ›    │
│ Bowler quota    Same for everyone     ›    │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │      Cancel      │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Format chips | A horizontal scroll row of 40-tall chips (SegmentedControl style, >4 items so it scrolls). Choosing a preset fills `rules` from `getBuiltinPreset`; any later rule edit keeps the chip but shows "T20 (edited)" |
| Overs | Chips from `OVERS_QUICK_PICKS`; "Other number" numeric field (1–999). A typed value deselects the chips (§7) |
| Rule rows | ListRow with the trailing value. Tap → a sheet per rule: Stepper for numbers; for Wides: penalty `0 · 1 · 2` + "Counts as a ball" switch; No-balls: penalty + "Free hit after a no-ball" switch + "Counts as a ball"; Powerplay: list of phases (name, from–to overs) + add; Super over: switch + overs + max wickets + "If tied again" `Another super over · Boundary count · Tie stands` + max rounds + "ICC player restrictions" switch; Mandatory retirement: switch + "Retire at" runs + "May return" + "When" `Immediately · End of over`; Bowler quota: `Same for everyone (1/5 rounded up)` · `ICC (one-fifth, some may bowl one extra)` |
| Validation | `validateRules` messages under the offending row in `danger` |
| Fixture entry | Hidden. The wizard starts at W-M3 with a read-only summary row "City Cup · Match 10 · T20 (from stage)" at the top, with **Change rules** allowed per the edit policy |

### W-M2 · Teams: `match/new/teams.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Teams                                   │
│    Step 2 of 5   ▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯ │
├────────────────────────────────────────────┤
│ TEAM A                                     │
│ PAK  Pakistan XI                     ▾     │
│      14 players                            │
├────────────────────────────────────────────┤
│ TEAM B                                     │
│ LIO  Lions                           ▾     │
│      12 players                            │
├────────────────────────────────────────────┤
│ Manage teams ›                             │
│                                            │
│ ADVANCED                                ▾  │
│ Different side sizes                 ○     │
│   Pakistan XI plays with   [-] 11 [+]      │
│   Lions play with          [-]  9 [+]      │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

Team rows show a 32 pt monogram (short name) + name `headline` + player count. Tapping opens the **team picker sheet** (search, recently used first, `+ New team` → name + short name (auto-suggested, 2–4 letters) → create → selected). "Different side sizes" maps to `teamAPlayers/teamBPlayers` (uneven gully sides, L5), with the explanation "Lions will be all out at 8 wickets."

### W-M3 · Players: `match/new/players.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Players                                 │
│    Step 3 of 5   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯ │
├────────────────────────────────────────────┤
│  Pakistan XI  11/11   │  Lions  9/11       │
│ ━━━━━━━━━━━━━━━━━━━━━━                     │
│ PLAYING XI         Select all · Order ▾    │
│ [x] 1  Saim Ayub                     C     │
│ [x] 2  Fakhar Zaman                        │
│ [x] 3  Babar Azam                          │
│ [x] 4  Mohammad Rizwan              WK     │
│ [x] 5  Shoaib Malik                        │
│ [ ]    Usman Khan                          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ + Add player                               │
├────────────────────────────────────────────┤
│ SUBSTITUTE FIELDERS                        │
│ [x]    Ali Raza                    sub     │
│ + Add substitute                           │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Team tabs | Tabs with the count "11/11" (turns `warning` text + `triangle-alert` if fewer than the side size, e.g. "9/11 ⚠") |
| Rows | 48 tall: checkbox (44 hit), batting order number (selection order, `tableNumeric` `textMuted`), name `body`, trailing role tags `C` / `WK` (Badge). Row ⋯ (long list) → "Make captain", "Make wicket-keeper", "Move up", "Move down". There is no drag-only reordering (§72) |
| Order ▾ | `Selection order · Alphabetical` |
| Add player | Inline row: name field + jersey (optional) + role picker → `TeamService.addPlayer` on Next |
| Warning | Fewer than the side size: banner "Lions have 9 of 11 players. The innings ends at 8 wickets." (not blocking) |

### W-M4 · Toss: `match/new/toss.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Toss                                    │
│    Step 4 of 5   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯ │
├────────────────────────────────────────────┤
│ WHO WON THE TOSS?                          │
│ ┌────────────────────────────────────────┐ │
│ │ (•) Pakistan XI                        │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ ( ) Lions                              │ │
│ └────────────────────────────────────────┘ │
│ ELECTED TO                                 │
│ (✓ Bat           )(   Bowl           )     │
│                                            │
│ Pakistan XI will bat first.                │
│                                            │
│ Toss not recorded ›                        │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

The toss options are 56-tall radio rows (`radius.md`, 1 `borderStrong`, selected = 2 `accent` border + `accentSubtle` + a filled radio). The summary sentence is `callout`. "Toss not recorded" → `toss: null` → the step becomes "Who bats first?" with the same two rows. The chosen side is stored as `battingFirstTeamId` and becomes the opening innings' batting team; Team A and Team B never swap. "Record the toss" clears that choice. "Toss not recorded" is offered for tournament fixtures too. Changing the side that bats first clears openers already picked, and Next stays disabled until a toss or a batting side is chosen.

### W-M5 · Openers: `match/new/openers.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Openers                                 │
│    Step 5 of 5   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ │
├────────────────────────────────────────────┤
│ PAKISTAN XI BATTING                        │
│ Striker (faces first ball)                 │
│ ▶  Saim Ayub                         ▾     │
│ Non-striker                                │
│    Fakhar Zaman                      ▾     │
├────────────────────────────────────────────┤
│ LIONS BOWLING                              │
│ Opening bowler                             │
│ ◉  Choose bowler                     ▾     │
├────────────────────────────────────────────┤
│ T20 · 20 overs · 11 a side                 │
│ Model Town Ground · Sat 12 Sep 14:00       │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │   Start match     │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

Striker and non-striker default to batting orders 1 and 2 (visible, changeable). The bowler has no default. **Start match** (`primary`) stays disabled until all three are chosen, then `submit()` runs and replaces the route with `score`. The pickers exclude substitutes and the player already chosen for the other end.

---

## Live scoring: `match/[matchId]/score.tsx` (§9–§21, §73)

### W-S1 · Live scoring, phone portrait (390 × 844 pt)

This is the most important screen (§9). The numbers in brackets are the §73 hierarchy ranks.

```text
┌────────────────────────────────────────────┐
│ ‹  PAK v LIO · T20                     ⋯   │
├────────────────────────────────────────────┤
│ PAKISTAN XI · 2ND INNINGS                  │
│ 142/4                      16.4 ov  [1][2] │
│                            of 20           │
│ CRR 8.52    RRR 9.12    TARGET 185         │
│ Need 43 from 20 balls                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ ▶ Ali Khan              42 (24)        [3] │
│   4s 3 · 6s 1                              │
│   Ahmed Shah            31 (27)            │
├────────────────────────────────────────────┤
│ ◉ Hassan Ali     3.4-0-28-2  ECO 7.63  [4] │
├────────────────────────────────────────────┤
│ THIS OVER                        RUNS  7   │
│ (1) ((4)) (·) [W] ╎WD╎ (2) ( )         [5] │
├────────────────────────────────────────────┤
│  ↶ Undo    ↷ Redo    ⇄ Swap    ⋯ More  [7] │
├────────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│ │   0   │ │   1   │ │   2   │ │   3   │    │
│ └───────┘ └───────┘ └───────┘ └───────┘    │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│ │   4   │ │   6   │ │   +   │ │  |||  │    │
│ │ FOUR  │ │  SIX  │ │EXTRAS │ │WICKET │    │
│ └───────┘ └───────┘ └───────┘ └───────┘    │
│                                        [6] │
└────────────────────────────────────────────┘
```

**Vertical budget (390 × 844, iPhone 14):** status bar 47 · top bar 44 · score block 148 · boundary rule 5 · batters 2 × 44 + 20 (the 4s/6s line) · bowler 48 · over strip 72 (label 20 + chips 32 + padding) · action row 48 · pad 2 × 72 + 8 + 24 = 176 · home indicator 34. Total 730, leaving about 114 of flexible space, which goes **above the score block** (so the pad and actions stay anchored to the bottom thumb zone) up to 32. Any remainder raises key height to 80.

| # | Element | Spec |
|---|---|---|
| – | Top bar | `‹` Back (leaves the match; it stays live), title `subhead` 600 "PAK v LIO · T20" (+ " · City Cup · M10" for fixtures), `⋯` More (opens W-S10). Paused state: a `Paused` badge after the title |
| 1 | Score | Batting team + innings `label` ("LIONS · 2ND INNINGS"; super over: "LIONS · SUPER OVER 1"). `scoreHero` 64 `score` colour "142/4" from `formatScore`. **Nothing else on screen is larger or heavier.** Tap → push `scorecard` |
| 2 | Overs | `scoreLarge` 40 "16.4" + `subhead` "ov", right-aligned on the score baseline; below it `footnote` `textMuted` "of 20" (`limits.maxBalls` via `formatOvers`; revised shows "of 12 (revised)") |
| – | Rates line | `label` "CRR" + `tableNumeric` 8.52 ×3 groups (RRR and TARGET only in a chase); `subhead` `textSecondary` |
| – | Requirement | `callout` 600 `textPrimary` "Need 43 from 20 balls" (`formatRequirement`); in the first innings this line shows "Powerplay · overs 1–6" while a powerplay is active, otherwise nothing. There is no projected score (no invented statistics, §103) |
| – | FREE HIT | When `isFreeHitNext`: a `warningSubtle` pill "FREE HIT" (`label`, `warning` text, `triangle-alert` 16) on the rates line, right-aligned |
| 3 | Batters | Two rows of 44. Striker: `▶` triangle (accent) + `accentSubtle` row + 3 pt accent leading bar + name `bodyStrong`; runs `figure` 22 + balls `subhead` "(24)". Non-striker: no marker, name `body`. The optional second line `footnote` "4s 3 · 6s 1" shows only for the striker. Row tap → a batter sheet (SR, dots, retire, swap) |
| 4 | Bowler | `◉` + name `bodyStrong` + figures `figure` "3.4-0-28-2" (`formatBowlingFigures`) + `label` ECO + `tableNumeric`. Tap → the bowler sheet (spell details, change bowler: injury/suspended) |
| 5 | Over strip | OverStrip (DESIGN_SYSTEM §6.4) with `lg` chips; placeholders for the remaining legal balls; "RUNS 7" is the over's runs so far (`currentOver.runs`) |
| 7 | Action row | 48 tall, 4 equal IconButton+label cells (icon 20 + `subhead`): **Undo** (disabled with "Nothing to undo" when the log is at `innings_started`), **Redo** (rendered only when the redo stack is non-empty; otherwise the cell is empty so the others don't shift), **Swap** (swap strike), **More**. Order is fixed so muscle memory holds |
| 6 | Pad | ScoringPad (DESIGN_SYSTEM §6.2), keys 72 tall, on `surfaceSunken`, bottom safe-area padding |

States:
- **Pending action**: the region from the action row down (action row + pad, 224 pt) is replaced by the panel for that action (W-S4 … W-S9). The panel is at least that height, so the pad never peeks out.
- **Toast** anchors under the boundary rule (over the batters area, never the pad).
- **Committing**: no spinner. The chip appears on commit (typically < 16 ms). If a commit takes more than 300 ms, a 2 pt indeterminate `accent` line shows under the top bar.

### W-S1b · Live scoring on a 320 pt phone (iPhone SE 1st gen, small Android), 320 × 568 pt

Content width 288 pt ≈ 34 characters. The score shrinks to 52 pt, rows to 40, and keys to 56. The order is unchanged. The 4s/6s line and the rates line collapse into one line.

```text
┌────────────────────────────────────┐
│ ‹  PAK v LIO                   ⋯   │
├────────────────────────────────────┤
│ PAK XI · 2ND INNS                  │
│ 142/4               16.4 ov        │
│ Need 43 off 20 · RRR 9.12          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────── │
│ ▶ Ali Khan        42 (24)          │
│   Ahmed Shah      31 (27)          │
├────────────────────────────────────┤
│ ◉ Hassan    3.4-0-28-2             │
├────────────────────────────────────┤
│ (1)((4))(·)[W]╎WD╎(2)( )     7     │
├────────────────────────────────────┤
│  ↶ Undo   ⇄ Swap   ⋯ More          │
├────────────────────────────────────┤
│ ┌──────┐┌──────┐┌──────┐┌──────┐   │
│ │  0   ││  1   ││  2   ││  3   │   │
│ └──────┘└──────┘└──────┘└──────┘   │
│ ┌──────┐┌──────┐┌──────┐┌──────┐   │
│ │  4   ││  6   ││EXTRAS││WICKET│   │
│ └──────┘└──────┘└──────┘└──────┘   │
└────────────────────────────────────┘
```

Changes at width < 360: CRR moves into the scorecard (RRR is kept because it drives decisions), the "THIS OVER" label is dropped (the strip is self-evident), Redo moves into More (Undo stays), key captions "FOUR/SIX" are dropped (the digit alone), and the ECO figure moves to the bowler sheet. The height budget on 568 pt: status 20 + top 44 + score 104 + rule 5 + batters 80 + bowler 40 + strip 48 + actions 44 + pad 2 × 56 + 8 + 16 = 136, total 521. See RESPONSIVE.md §3.

### W-S2 · Extras sheet (§17)

```text
┌────────────────────────────────────────────┐
│               (score still visible)        │
├────────────────────────────────────────────┤
│                   ────                     │
│ Extras                                 ✕   │
│  Wide │ No ball │ Bye │ Leg bye │ Other    │
│ ━━━━━━                                     │
│ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │   WD   │ │  WD+1  │ │  WD+2  │           │
│ └────────┘ └────────┘ └────────┘           │
│ ┌────────┐ ┌────────┐ ┌────────────────┐   │
│ │  WD+3  │ │  WD+4  │ │ Boundary (+4)  │   │
│ └────────┘ └────────┘ └────────────────┘   │
│ Custom…                                    │
│                                            │
│ Wide penalty is 1 run (match rule).        │
└────────────────────────────────────────────┘
```

Taps commit immediately (USER_FLOWS §2.3). Chips are 56 tall and at least 96 wide, text `figureSmall` + a smaller `footnote` meaning line where needed ("ran 4" / "to the rope"). The **No ball** tab:

```text
┌────────────────────────────────────────────┐
│ Extras                                 ✕   │
│  Wide │ No ball │ Bye │ Leg bye │ Other    │
│         ━━━━━━━━━                          │
│ Runs off   (✓ Bat )( Byes )( Leg byes )    │
│ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │   NB   │ │   +1   │ │   +2   │           │
│ └────────┘ └────────┘ └────────┘           │
│ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │   +3   │ │  +4    │ │  +6    │           │
│ │        │ │  four  │ │  six   │           │
│ └────────┘ └────────┘ └────────┘           │
│ Custom…                                    │
│ Next ball is a free hit.                   │
└────────────────────────────────────────────┘
```

With Byes or Leg byes selected, `+6` is hidden and `+4` means "4 byes to the boundary". The **Other** tab lists rows (not chips): `5 runs`, `7 runs`, `All-run 4`, `1 + 4 overthrows`, `2 + 4 overthrows`, `Short run…`, `Penalty runs…`. The **Custom…** panel replaces the chips: Runs run Stepper, Boundary `None · 4 · 6`, "More" → Short runs Stepper, and `[ Record ]` `primary lg`.

### W-S3 · Wicket sheet (§18)

Step 1 (committing on Bowled, LBW or Hit wicket):

```text
┌────────────────────────────────────────────┐
│                   ────                     │
│ Wicket                                 ✕   │
│ Delivery  (✓ Fair )( Wide )( No ball )     │
│ Next in   Shoaib Malik                ▾    │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │      Bowled      │ │      Caught       │ │
│ └──────────────────┘ └───────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       LBW        │ │      Run out      │ │
│ └──────────────────┘ └───────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │     Stumped      │ │    Hit wicket     │ │
│ └──────────────────┘ └───────────────────┘ │
│ More dismissals ›                          │
│ Striker: Ali Khan (42)                     │
└────────────────────────────────────────────┘
```

Dismissal buttons are 56 tall `secondary`, label `bodyStrong`. Options not allowed for the chosen delivery or on a free hit are **removed**, not disabled. On a free hit a `warningSubtle` line reads "Free hit: only run out or obstruction". "Next in" is preselected to `candidates[0]`. Its picker lists the candidates and **Choose later**. For the last wicket the row reads "Last wicket: the innings ends".

Step 2a, **Caught** (tap a fielder = commit):

```text
┌────────────────────────────────────────────┐
│ ‹  Caught                              ✕   │
│ Who took the catch?                        │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ Hassan Ali  c&b  │ │ Rizwan  WK        │ │
│ └──────────────────┘ └───────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ Shadab Khan      │ │ Imad Wasim        │ │
│ └──────────────────┘ └───────────────────┘ │
│   … (fielding XI, 2 columns)               │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ Ali Raza   sub   │ │ Catcher not known │ │
│ └──────────────────┘ └───────────────────┘ │
│ Next in   Shoaib Malik                ▾    │
└────────────────────────────────────────────┘
```

The bowler is first (marked "c&b"), then the keeper (WK), then the batting order. Substitute fielders are last, tagged "sub". **Stumped** uses the same grid with the designated keeper first and outlined in `accent` ("Confirm keeper"). **Run out** step:

```text
┌────────────────────────────────────────────┐
│ ‹  Run out                             ✕   │
│ Who's out     (✓ Striker )( Non-striker )  │
│               Ali Khan                     │
│ At which end  (✓ Keeper's )( Bowler's )    │
│ Runs completed  (✓0)( 1 )( 2 )( 3 )        │
│ Fielders (optional)                        │
│   Thrower        Choose ▾                  │
│   At the stumps  Choose ▾                  │
│ Next in   Shoaib Malik                ▾    │
│ ┌────────────────────────────────────────┐ │
│ │             Record run out             │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

The defaults are shown selected, so three taps (WICKET → Run out → Record run out) records the common case. A Law 16.6 rejection shows inline above the button: "The match was already won before this wicket. Record the runs without the wicket." with [Record without wicket].

### W-S4 · Next batter panel (`select_next_batter`)

```text
┌────────────────────────────────────────────┐
│ (score block, batters, bowler visible)     │
├────────────────────────────────────────────┤
│ NEXT BATTER · replaces Ali Khan (striker)  │
│ ┌────────────────────────────────────────┐ │
│ │ 6  Shoaib Malik                        │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ 7  Imad Wasim                          │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ 8  Shadab Khan                         │ │
│ └────────────────────────────────────────┘ │
│ All batters ›        + Add player          │
│ Undo last ball                             │
└────────────────────────────────────────────┘
```

Shows the top 3 candidates as 56-tall buttons; "All batters" opens the full list, including retired-hurt batters ("Retired hurt, may resume"). With `canEndInnings`: an extra `secondary` button **End innings: no batters available**. **Undo last ball** is a `tertiary` button on every pending panel.

### W-S5 · Next bowler panel (`select_next_bowler`)

```text
┌────────────────────────────────────────────┐
│ OVER 18 · CHOOSE BOWLER                    │
│ ┌────────────────────────────────────────┐ │
│ │ Shaheen Afridi   3-0-22-1   1 over left│ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Shadab Khan      2-0-14-0  2 overs left│ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Imad Wasim       –          4 overs    │ │
│ └────────────────────────────────────────┘ │
│ CAN'T BOWL THIS OVER                       │
│ Hassan Ali    Bowled the last over         │
│ Haris Rauf    Reached 4 overs              │
│ Undo last ball                             │
└────────────────────────────────────────────┘
```

Eligible bowlers come first, those who have bowled ordered by most recent spell, then the others. The "can't bowl" rows are `textMuted` and not tappable; the reason text comes from `BowlerIneligibility`. The "overs left" figure is `InningsLimits`/figures data from the domain, never counted in the UI.

### W-S6 · Innings break panel (`start_next_innings`)

```text
┌────────────────────────────────────────────┐
│ LIONS · 1ST INNINGS                        │
│ 184/6                      20.0 ov         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ INNINGS COMPLETE · overs completed         │
│ Pakistan XI need 185 to win                │
│ from 120 balls (20 overs)                  │
├────────────────────────────────────────────┤
│ PAKISTAN XI OPENERS                        │
│ Striker        Saim Ayub              ▾    │
│ Non-striker    Fakhar Zaman           ▾    │
│ LIONS BOWLER                               │
│ Opening bowler Choose                 ▾    │
│ ┌────────────────────────────────────────┐ │
│ │           Start 2nd innings            │ │
│ └────────────────────────────────────────┘ │
│ Undo last ball                             │
└────────────────────────────────────────────┘
```

The completion reason text maps from `InningsCompletionReason` ("all out", "overs completed", "declared", "no batters available"). With `confirmInningsEnd` on, the panel first shows "End of innings?" with [Continue] / [Undo last ball]. For super overs the header reads "SUPER OVER 1 · LIONS BAT" and ineligible players are listed under "Not eligible".

### W-S7 · Play suspended panel (`resume_play`)

```text
┌────────────────────────────────────────────┐
│ PLAY SUSPENDED · Rain                      │
│ Since 14.2 overs · 15:10                   │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │              Resume play               │ │
│ └────────────────────────────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │   Revise overs   │ │   End match…      │ │
│ └──────────────────┘ └───────────────────┘ │
│ Penalty runs ·  Undo last ball             │
└────────────────────────────────────────────┘
```

The top bar badge reads "Paused". Revise overs opens the sheet described in USER_FLOWS §2.8. It includes the switch **Chase ends here: decide on par score** (terminal) with the helper about DLS. End match… opens Match settings → End match.

### W-S8 · Confirm result panel (`confirm_result`)

```text
┌────────────────────────────────────────────┐
│ PAKISTAN XI · 2ND INNINGS                  │
│ 185/5                      18.0 ov         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ Pakistan XI won by 5 wickets               │
│ (12 balls left)                            │
│                                            │
│ Confirm to finish the match and update     │
│ the City Cup standings.                    │
│ ┌────────────────────────────────────────┐ │
│ │             Confirm result             │ │
│ └────────────────────────────────────────┘ │
│ Undo last ball                             │
└────────────────────────────────────────────┘
```

The result text is `pendingAction.text` in `title2`. The second line is present only for tournament matches. After confirming, the result motion plays (DESIGN_SYSTEM §8) and the screen moves to the scorecard (USER_FLOWS §1 step 14).

### W-S9 · Tied match panel (`resolve_tie`)

```text
┌────────────────────────────────────────────┐
│ MATCH TIED · 168 each                      │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │           Play a super over            │ │
│ └────────────────────────────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │  Accept the tie  │ │ Decide another way│ │
│ └──────────────────┘ └───────────────────┘ │
│ Undo last ball                             │
└────────────────────────────────────────────┘
```

Buttons appear only for `pendingAction.options`. "Decide another way" opens a sheet: method `Boundary count · Bowl-out · Coin toss · Organizer decision`, winner (two team rows), reason, then **Record result**.

### W-S10 · More sheet (live scoring)

```text
┌────────────────────────────────────────────┐
│                   ────                     │
│ More                                   ✕   │
│ MATCH                                      │
│ Scorecard                              ›   │
│ Ball by ball                           ›   │
├────────────────────────────────────────────┤
│ PLAY                                       │
│ Change bowler (injury)                 ›   │
│ Retire or dismiss batter               ›   │
│ Penalty runs                           ›   │
│ Suspend play                           ›   │
│ Revise overs                           ›   │
│ End innings                            ›   │
├────────────────────────────────────────────┤
│ Redo                  (when available)     │
│ Match settings                         ›   │
└────────────────────────────────────────────┘
```

ListRows (48). "Retire or dismiss batter" opens: batter (striker / non-striker), type `Retired hurt · Retired not out · Retired out · Run out (no ball bowled) · Obstructing · Timed out`, the next batter, and **Record**.

### W-S11 · Banners on the live screen

```text
┌────────────────────────────────────────────┐
│ PAKISTAN XI · 2ND INNINGS                  │
│ 142/4                      16.4 ov         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ ▌⚠ Ali Khan reached 30 (retirement rule).  │
│ ▌  [Retire]  [Not now]                     │
├────────────────────────────────────────────┤
│ ▶ Ali Khan              30 (19)            │
│   … rest of the screen unchanged           │
└────────────────────────────────────────────┘
```

```text
┌────────────────────────────────────────────┐
│ PAKISTAN XI · 2ND INNINGS                  │
│ 142/4                      16.4 ov         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ ▌(!) This match needs repair               │
│ ▌One recorded event can't be applied:      │
│ ▌17.3 · Hassan Ali to Ali Khan.            │
│ ▌[Review ball]    [Undo last action]       │
├────────────────────────────────────────────┤
│   (action row and pad are replaced by      │
│    the banner; no scoring until repaired)  │
└────────────────────────────────────────────┘
```

The advisory banner is `warningSubtle` with a 3 pt `warning` bar and never blocks the pad. The repair banner is `dangerSubtle` with a `danger` bar and replaces the action row and pad. Its copy comes from the first error `ReplayIssue`.

### W-S12 · Tablet two-pane live scoring (§74), ≥ 768 dp wide

On tablets (≥ 768 dp in either orientation) the scoring route renders **two panes**: the live scorecard on the left (flex 1.25, min 400) and the scoring column on the right (fixed 420, the same components as the phone at `lg` sizes). This is not a stretched phone. Shown here at 1024 × 768 landscape, where the left pane is 56 characters and the right is 42.

```text
┌──────────────────────────────────────────────────────────┬────────────────────────────────────────────┐
│ ‹  City Cup · Match 10 · PAK v LIO · T20                 │                                            │
├──────────────────────────────────────────────────────────┼────────────────────────────────────────────┤
│  LIONS 184/6 (20) │ PAKISTAN XI 142/4 (16.4)             │ PAKISTAN XI · 2ND INNINGS                  │
│                    ━━━━━━━━━━━━━━━━━━━━━━━━              │ 142/4               16.4 ov                │
│ BATTING                 R    B   4s  6s     SR           │                     of 20                  │
│ ▶ Ali Khan    not out  42   24    3   1  175.0           │ CRR 8.52  RRR 9.12  TARGET 185             │
│   Ahmed Shah  not out  31   27    2   0  114.8           │ Need 43 from 20 balls                      │
│   Saim Ayub   c Rizwan b Hassan                          │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                        28   19    4   1  147.4           │ ▶ Ali Khan         42 (24)                 │
│   Babar Azam  b Shaheen                                  │   Ahmed Shah       31 (27)                 │
│                        22   18    2   0  122.2           ├────────────────────────────────────────────┤
│   … (all batters)                                        │ ◉ Hassan Ali  3.4-0-28-2 ECO 7.63          │
│ Extras  (wd 5, nb 2, lb 2)                    9          ├────────────────────────────────────────────┤
│ TOTAL   4 wkts, 16.4 ov                  142/4           │ THIS OVER                   RUNS 7         │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ (1)((4))(·)[W]╎WD╎(2)( )                   │
│ BOWLING               O   M    R   W   Econ              ├────────────────────────────────────────────┤
│ ◉ Hassan Ali        3.4   0   28   2   7.63              │  ↶ Undo  ↷ Redo  ⇄ Swap  ⋯ More            │
│   Shaheen Afridi    4.0   0   31   1   7.75              ├────────────────────────────────────────────┤
│   …                                                      │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
├──────────────────────────────────────────────────────────┤ │  0   │ │  1   │ │  2   │ │  3   │        │
│ FALL OF WICKETS                                          │ └──────┘ └──────┘ └──────┘ └──────┘        │
│ 1-45 (Saim, 5.2) · 2-78 (Babar, 9.4) · …                 │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
├──────────────────────────────────────────────────────────┤ │  4   │ │  6   │ │EXTRAS│ │WICKET│        │
│ OVERS  16 (1)(1)(·)((4))(1)(2)   9                       │ │ FOUR │ │ SIX  │ │      │ │ |||  │        │
│        17 (1)((4))(·)[W]╎WD╎(2)( ) …                     │ └──────┘ └──────┘ └──────┘ └──────┘        │
└──────────────────────────────────────────────────────────┴────────────────────────────────────────────┘
```

| Region | Spec |
|---|---|
| Left pane | The live scorecard component (the same as `scorecard.tsx` in "live" mode): innings Tabs, batting table with the striker row highlighted (▶ + `accentSubtle` + bar), extras, total with the boundary rule, bowling table with the current bowler (◉), FoW, and the last 3 overs as chip rows (`md` chips). It scrolls independently; auto-scroll is off (the scorer controls it) |
| Right pane | Exactly the phone hierarchy: `scoreHero` at 72, keys 80 tall, gutter 24. Sheets and pending panels open **inside the right pane** (sheet width = pane width, anchored to its bottom), so the scorecard stays readable while choosing a fielder. **Wave-2 status:** pending panels are in the right pane; sheets are not yet. The `src/ui` `Sheet` is an RN `Modal`, so it covers the window. Closing this needs a pane presentation on `Sheet` (for example `presentation: 'pane'`, rendering inside its parent instead of a `Modal`), owned by WP-design-system; the scoring feature then passes it on tablets |
| Divider | Hairline `border` vertical rule, full height |
| Portrait tablet (768–1023 wide) | Same two panes, left min 360; the left scorecard drops the 4s/6s columns and FoW moves under bowling |
| Split view / < 768 dp window | Falls back to the phone layout (RESPONSIVE.md §2) |

### W-S13 · Phone landscape (optional, §74)

`app.json` currently locks `"orientation": "portrait"` (see the report in RESPONSIVE.md §4). If landscape is enabled, a phone at ≥ 640 dp wide × < 500 dp tall uses a **side-by-side compact** layout: left half = score block + batters + bowler + over strip; right half = action row + pad (keys 56 tall). The scorecard pane is not shown on phones.

```text
┌────────────────────────────────┬────────────────────────────────┐
│ PAK XI · 2ND INNINGS           │  ↶ Undo  ⇄ Swap  ⋯ More        │
│ 142/4          16.4 ov         ├────────────────────────────────┤
│ RRR 9.12 · Need 43 off 20      │ ┌─────┐┌─────┐┌─────┐┌─────┐   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ │  0  ││  1  ││  2  ││  3  │   │
│ ▶ Ali Khan      42 (24)        │ └─────┘└─────┘└─────┘└─────┘   │
│   Ahmed Shah    31 (27)        │ ┌─────┐┌─────┐┌─────┐┌─────┐   │
│ ◉ Hassan  3.4-0-28-2           │ │  4  ││  6  ││EXTRA││WCKT │   │
│ (1)((4))(·)[W]╎WD╎(2)( )       │ └─────┘└─────┘└─────┘└─────┘   │
└────────────────────────────────┴────────────────────────────────┘
```

In landscape the key labels stay full words ("EXTRAS", "WICKET") at 13 pt; the frame abbreviates only because of ASCII width.

---

## Match screens: `match/[matchId]/*`

### W-C1 · Scorecard: `scorecard.tsx` (§83)

```text
┌────────────────────────────────────────────┐
│ ‹  Scorecard                   [Share]  ⋯  │
├────────────────────────────────────────────┤
│ Lions won by 5 wickets (12 balls left)     │
│ Tigers won the toss and chose to bat       │
│ Model Town Ground · Sat 12 Sep · T20       │
│ City Cup 2026 · Match 10                ›  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│  TIG 168/7 (20)  │  LIO 169/5 (18)         │
│ ━━━━━━━━━━━━━━━━━━                         │
│ BATTING              R   B  4s 6s    SR    │
│ Hamza Ali           54  38   5  2 142.1    │
│   c Rizwan b Hassan                        │
│ Omar Farooq         12  15   1  0  80.0    │
│   run out (sub (Ali))                      │
│ Bilal Asif          33  21   2  2 157.1    │
│   not out                                  │
│   …                                        │
│ Extras  (b 1, lb 2, wd 6, nb 1)       10   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ TOTAL   7 wkts · 20 ov · RR 8.40    168    │
│ Did not bat: Adeel, Fahad                  │
│ Absent hurt: Kamran                        │
├────────────────────────────────────────────┤
│ FALL OF WICKETS                            │
│ 1-12 (Omar, 2.3)  2-58 (Hamza, 7.1)  …     │
├────────────────────────────────────────────┤
│ BOWLING           O  M   R  W  Econ WD NB  │
│ Hassan Ali      4.0  0  28  2  7.00  2  1  │
│   …                                        │
├────────────────────────────────────────────┤
│ PARTNERSHIPS                               │
│ 1st  Hamza & Omar      12 (14)             │
├────────────────────────────────────────────┤
│ OVERS                                      │
│  1  (1)(·)(·)((4))(1)(·)          6  6/0   │
│  2  (·)╎WD╎(1)(1)(●6)(·)(2)      11 17/0   │
├────────────────────────────────────────────┤
│ [ Ball by ball ›]   [ Analytics ›]         │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Header | Result `title2` (live: the status badge + "Pakistan XI need 43 from 20 balls"); toss / venue / date `footnote`; tournament link row (tournament matches only) |
| Tournament block | For tournament matches after completion: "STANDINGS UPDATED": a 4-row excerpt of the pool table + qualification lines + [View standings] (USER_FLOWS §4.4 step 6) |
| Innings tabs | Tabs labelled with the short name + score; super overs appear as extra tabs "Super over" |
| Batting table | Table (DESIGN_SYSTEM §6.5); dismissal text on the second line from `dismissalText` ("c ? b Hassan", "c sub (Ali) b Hassan", "absent hurt") |
| Totals | Boundary rule above TOTAL; `bodyStrong` + `scoreMedium` total |
| Over summary | `sm` chips per over + over runs + score at end (`OverSummary.scoreAtEnd`); a row tap → Ball by ball at that over |
| Share | `secondary sm` → the share sheet: **PDF scorecard** / **Backup file** |
| ⋯ | Match settings, Reopen match (completed), Delete (standalone) |

### W-C2 · Ball by ball: `balls.tsx` (scorebook grid)

```text
┌────────────────────────────────────────────┐
│ ‹  Ball by ball                            │
│  TIG 1st inns  │  LIO 2nd inns             │
│                ━━━━━━━━━━━━━━              │
│ OVER 17 · Hassan Ali          9 · 142/4    │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬────┐ │
│ │ (1) │((4))│ (·) │ [W] │╎WD╎ │ (2) │ (1)│ │
│ │ .1  │ .2  │ .3  │ .4  │     │ .5  │ .6 │ │
│ └─────┴─────┴─────┴─────┴─────┴─────┴────┘ │
│   17.4  Ali Khan b Hassan Ali              │
│   Shoaib Malik comes in                    │
├────────────────────────────────────────────┤
│ OVER 16 · Shaheen Afridi      6 · 133/3    │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┐      │
│ │ (1) │ (1) │ (·) │((4))│ (·) │ (·) │      │
│ │ .1  │ .2  │ .3  │ .4  │ .5  │ .6  │      │
│ └─────┴─────┴─────┴─────┴─────┴─────┘      │
│   End of over 16: Hassan Ali to bowl       │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
└────────────────────────────────────────────┘
```

Each over is a row of ball cells (48 × 56, tap targets). The cell shows the `md` chip and the ball label (`.1`–`.6`; extras show no number because they are not legal balls). Non-delivery events (batter in, bowler change, penalty, suspension, revision) are listed as `footnote` text lines under the over, as a scorer would note them in the margin. A cell tap → `edit/[seq]`. The newest over is on top. Live matches show a "Live" badge on the current over.

### W-C3 · Edit ball: `edit/[seq].tsx` (§16, §99)

```text
┌────────────────────────────────────────────┐
│ ‹  Edit ball 17.2                          │
├────────────────────────────────────────────┤
│ RECORDED                                   │
│ ((4))  FOUR · Hassan Ali to Ali Khan       │
├────────────────────────────────────────────┤
│ CHANGE TO                                  │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│ │   0   │ │   1   │ │   2   │ │   3   │    │
│ └───────┘ └───────┘ └───────┘ └───────┘    │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│ │   4   │ │   6   │ │EXTRAS │ │WICKET │    │
│ └───────┘ └───────┘ └───────┘ └───────┘    │
│ New: ╎WD╎  Wide                            │
│ Delete this ball · Insert a ball before    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ WHAT WILL CHANGE                           │
│ Score        142/4 → 139/4                 │
│ Overs        16.4 → 16.3                   │
│ Ali Khan     42 (24) → 38 (23)             │
│ Hassan Ali   3.4-0-28-2 → 3.3-0-25-2       │
│              one more ball in over 17      │
│ Result       no change                     │
├────────────────────────────────────────────┤
│ CITY CUP                                   │
│ Standings unchanged. NRR: Lions +0.412 →   │
│ +0.398                                     │
├────────────────────────────────────────────┤
│ Reason (required for completed matches)    │
│ ┌────────────────────────────────────────┐ │
│ │ Umpire signalled wide; scorer missed it│ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │              Apply change              │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

The preview section appears after a replacement is chosen (`previewHistoryEdit`). Before/after values come from `HistoryEditPreview.outcome.before/after` and `impact`. Arrows are text "→", and changed values are `bodyStrong`. A result change gets a `warningSubtle` row: "Result changes: Lions won by 5 wickets → Lions won by 2 wickets". A domain validation failure replaces the preview with the explanation and a fix-up button (USER_FLOWS §5 step 5). **Apply change** is `primary lg`, or `destructiveConfirm` when the impact severity is `destructive`.

### W-C4 · Analytics: `analytics.tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Analytics                               │
├────────────────────────────────────────────┤
│ RUNS BY OVER (WORM)                        │
│ 180┤                         ___── TIG     │
│    │                 ___──╌╌╌╌╌╌ LIO       │
│    │         ___──╌╌╌                      │
│    │   __──╌╌    ●W        ●W              │
│   0└──────────────────────────────         │
│     0    5    10    15    20 overs         │
│ Legend: ── Tigers   ╌╌ Lions   ● wicket    │
├────────────────────────────────────────────┤
│ RUNS PER OVER (MANHATTAN) · TIG | LIO      │
│    ▇                                       │
│    ▇  ▅     ▇W      ▅                      │
│ ▃  ▇  ▅  ▃  ▇   ▅   ▅  …                   │
│ 1  2  3  4  5   6   7                      │
├────────────────────────────────────────────┤
│ PARTNERSHIPS · TIG                         │
│ 1st  Hamza & Omar       12 ▇▇              │
│ 2nd  Hamza & Bilal      46 ▇▇▇▇▇▇▇▇        │
├────────────────────────────────────────────┤
│ SCORING                   TIG     LIO      │
│ Dots                       41      38      │
│ Ones · Twos · Threes    38·9·1  44·7·0     │
│ Fours · Sixes            12·6    14·5      │
│ Extras                     10       9      │
│ [ Show as table ]                          │
└────────────────────────────────────────────┘
```

Charts follow THEMES.md §4: two series (`chartSeries1` solid, `chartSeries2` **dashed**), wicket markers as filled dots with a "W" label, direct end labels with team short names plus a legend, and gridlines in `chartGrid`. Every chart has **Show as table** (accessibility, ACCESSIBILITY.md §8). Data comes from `stats.worm`, `stats.manhattan` and `boundaryCounts`.

### W-C5 · Match settings: `manage.tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Match settings                          │
│ DETAILS                                    │
│ Title          Pakistan XI v Lions     ›   │
│ Venue          Model Town Ground       ›   │
│ Date & time    Sat 12 Sep 14:00        ›   │
├────────────────────────────────────────────┤
│ RULES                        Confirm edits │
│ Overs          20 (revise…)            ›   │
│ Side sizes     11 v 11                 ›   │
│ Wides / no-balls / powerplay…          ›   │
│ Toss           Pakistan XI, bat        ›   │
├────────────────────────────────────────────┤
│ SQUADS                                     │
│ Pakistan XI    11 + 1 sub              ›   │
│ Lions          11                      ›   │
├────────────────────────────────────────────┤
│ PLAY                                       │
│ Suspend play                           ›   │
│ End match                              ›   │
│    Abandoned · No result · Awarded         │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │             Discard match              │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

Rows follow `matchEditPolicy(status, {inTournament})`. `allowed` rows open editors directly. `confirm` rows (rules, toss) open the editor and then a confirm step with a reason (tournament: WHAT WILL CHANGE). `forbidden` rows show the value with a `lock` icon and the reason on tap ("Teams can't change after play has started"). **Discard match** (`destructive`) appears only for live standalone matches. Completed standalone matches show **Delete match**. Tournament matches show neither.

---

## Teams library: `teams/*` (§27)

### W-L1 · Teams: `teams/index.tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Teams                        [+ New]    │
│ ┌────────────────────────────────────────┐ │
│ │ ⌕  Search teams                        │ │
│ └────────────────────────────────────────┘ │
├────────────────────────────────────────────┤
│ LIO  Lions                     12 players  │
├────────────────────────────────────────────┤
│ PAK  Pakistan XI               14 players  │
├────────────────────────────────────────────┤
│ TIG  Tigers                    11 players  │
├────────────────────────────────────────────┤
│ Show archived teams                  ○     │
└────────────────────────────────────────────┘
```

Rows: a 32 pt monogram + name `body` + count `footnote`. Empty state: "No teams yet" / "Add a team once and reuse it in matches and tournaments." / `ADD TEAM`.

### W-L2 · Team: `teams/[teamId].tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Lions                          Edit     │
│ Short name LIO · Captain Hamza Ali         │
├────────────────────────────────────────────┤
│ PLAYERS (12)                  + Add player │
│ #7   Hamza Ali           Batter      C     │
├────────────────────────────────────────────┤
│ #10  Rizwan Ahmed        Keeper     WK     │
├────────────────────────────────────────────┤
│ #23  Hassan Ali          Bowler            │
├────────────────────────────────────────────┤
│      Umar Gul            All-rounder       │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ┌────────────────────────────────────────┐ │
│ │              Archive team              │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

A player row tap → the player sheet (name, jersey, role `Batter · Bowler · All-rounder · Keeper`, Archive player). Archiving keeps history, and the helper text explains this: "Archived players stay in past scorecards."

---

## Tournament creation wizard: `tournament/new/*` (§25, §65)

Common chrome: `✕` Close (the draft is saved), the title, "Step n of 7" plus a 7-segment rule. Sticky footer [Back] [Next]. Every step saves on Next (`saveStep`).

### W-N1 · Tournament details: `index.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  New tournament                          │
│   Step 1 of 7  ▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯  │
├────────────────────────────────────────────┤
│ Name                                       │
│ ┌────────────────────────────────────────┐ │
│ │ City Cup                               │ │
│ └────────────────────────────────────────┘ │
│ Season (optional)       Organizer          │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │ 2026             │ │ Lahore CA         │ │
│ └──────────────────┘ └───────────────────┘ │
│ Starts  Sat 12 Sep ▾    Ends  Sun 4 Oct ▾  │
│ Venues  Model Town Ground, +1          ›   │
│ Description (optional)                     │
│ ┌────────────────────────────────────────┐ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │      Cancel      │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

### W-N2 · Teams: `teams.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Teams                                   │
│   Step 2 of 7  ▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯  │
├────────────────────────────────────────────┤
│ 12 teams selected        Seeds  ○          │
│ ┌────────────────────────────────────────┐ │
│ │ ⌕  Search                              │ │
│ └────────────────────────────────────────┘ │
│ [x] LIO  Lions                             │
│ [x] TIG  Tigers                            │
│ [x] HAW  Hawks                             │
│ [ ] EAG  Eagles                            │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ + New team        Select all shown         │
├────────────────────────────────────────────┤
│   (Seeds on:)                              │
│ [x] LIO  Lions               Seed [ 1 ]    │
│ [x] TIG  Tigers              Seed [ 2 ]    │
│ [x] HAW  Hawks               Seed [   ]    │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

The list is virtualised (supports ≥ 128 teams, §27). Seeds are optional numeric fields (1 = strongest). The helper line reads "Seeds are used for seeded pools and ranking knockouts."

### W-N3 · Format: `structure.tsx` (§28, §29, §56)

```text
┌────────────────────────────────────────────┐
│ ✕  Format                                  │
│   Step 3 of 7  ▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯  │
├────────────────────────────────────────────┤
│ TEMPLATES FOR 12 TEAMS                     │
│ ( ) 8-Team T20 · 2 pools, SF, final        │
│       needs 8 teams                        │
│ (•) Custom from structure below            │
│ Other templates ›                          │
├────────────────────────────────────────────┤
│ STRUCTURE                                  │
│ ( League )(•Groups + KO)( Knockout )       │
│ ( Groups )( Custom )                       │
├────────────────────────────────────────────┤
│ STAGES                            + Stage  │
│ 1  Group stage    3 pools · single RR   ›  │
│ 2  Semifinals     Top 2 + best 3rd      ›  │
│    Knockout · SF, Final   ★ Champion       │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

Templates that do not fit the team count are shown collapsed with the reason ("needs 8 teams"). The stage rows open the stage editor sheet (the same fields as W-D8). "★ Champion" marks `decidesChampion` as text + icon; tapping it moves the marker. Reorder uses ↑/↓ in each stage's ⋯ menu.

### W-N4 · Rules: `rules.tsx` (§40–§43)

```text
┌────────────────────────────────────────────┐
│ ✕  Rules                                   │
│   Step 4 of 7  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯  │
├────────────────────────────────────────────┤
│ POINTS                                     │
│ Win            [-]  2 [+]                  │
│ Tie            [-]  1 [+]                  │
│ No result      [-]  1 [+]                  │
│ Loss           [-]  0 [+]                  │
│ More: abandoned, walkover, bonus       ›   │
├────────────────────────────────────────────┤
│ NET RUN RATE                               │
│ (•) ICC: all out counts as full overs      │
│ ( ) Actual overs faced                     │
├────────────────────────────────────────────┤
│ TIE-BREAKERS (in order)                    │
│ 1  Points                           ↑ ↓    │
│ 2  Net run rate                     ↑ ↓ ✕  │
│ 3  Head-to-head                     ↑ ↓ ✕  │
│ 4  Most wins                        ↑ ↓ ✕  │
│ + Add tie-breaker                          │
│ Points → NRR → Head-to-head → Wins         │
├────────────────────────────────────────────┤
│ MATCH FORMAT      T20 · 20 overs       ›   │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

The ↑/↓/✕ are 44 pt IconButtons with labels ("Move Net run rate up"). The chain summary line (`describeTieBreakerChain`) updates live. "Points" is fixed first.

### W-N5 · Pools: `pools.tsx` (§30–§32)

```text
┌────────────────────────────────────────────┐
│ ✕  Pools                                   │
│   Step 5 of 7  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯  │
├────────────────────────────────────────────┤
│ Pools  [-] 3 [+]      4 · 4 · 4            │
│ Method (•Random)( Seeded )( Manual )       │
│ Seed (optional)                            │
│ ┌────────────────────────────────────────┐ │
│ │ 847291                                 │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │               Draw pools               │ │
│ └────────────────────────────────────────┘ │
│ Random draw · seed 847291                  │
│ Restore previous arrangement               │
├────────────────────────────────────────────┤
│ POOL A                                     │
│ Tigers                                 ⋯   │
│ Lions                                  ⋯   │
│ Eagles                                 ⋯   │
│ Hawks                                  ⋯   │
│ POOL B                                     │
│ …                                          │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │       Next        │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

Uneven sizes (for example 4 · 3 · 3) show the §32 warning banner under the Pools row. Draw with existing pools shows the Dialog "Current pool arrangement will be replaced." (§31). After a draw: toast [Undo] plus the persistent **Restore previous arrangement** link (USER_FLOWS §4.2). Manual method: the pools are empty, and an "Unassigned (4)" section lists teams with ⋯ → "Add to Pool A/B/C". Member ⋯ → Move to pool… / Swap with…. On tablets the pools render as columns side by side.

### W-N6 · Fixtures: `fixtures.tsx` (§35, §36)

```text
┌────────────────────────────────────────────┐
│ ✕  Fixtures                                │
│   Step 6 of 7  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯  │
├────────────────────────────────────────────┤
│ GROUP STAGE                                │
│ (•Single RR)( Double RR )( Custom: n )     │
│ Start Sat 12 Sep · 2 matches a day     ›   │
│ [ Generate ]   [ Schedule dates ]          │
├────────────────────────────────────────────┤
│ PREVIEW · 18 matches · not saved yet       │
│ ROUND 1                                    │
│ M1  Tigers v Lions        Sat 12 · 10:00 › │
│ M2  Eagles v Hawks        Sat 12 · 14:00 › │
│ M3  Pumas v Rhinos        Sun 13 · 10:00 › │
│ ROUND 2                                    │
│ ▌⚠ Hawks play twice on Sat 19 Sep          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ SEMIFINALS (between qualifiers)            │
│ SF1  A1 v B2 · SF2  B1 v A2 · F  W1 v W2   │
├────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │       Back       │ │ Confirm fixtures  │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

A fixture row tap → the Fixture editor sheet. Warnings from `validateFixtureDrafts` show inline as warning rows; errors disable Confirm. "Not saved yet" makes the §36 "Generate → Preview → Edit → Confirm" explicit. Confirm → `confirmFixtures` → next step.

### W-N7 · Review: `review.tsx`

```text
┌────────────────────────────────────────────┐
│ ✕  Review                                  │
│   Step 7 of 7  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮  │
├────────────────────────────────────────────┤
│ City Cup 2026                              │
│ Sat 12 Sep – Sun 4 Oct · Lahore CA         │
├────────────────────────────────────────────┤
│ TEAMS · 12                          Edit   │
│ Lions, Tigers, Hawks, Eagles, +8           │
│ FORMAT                              Edit   │
│ Group stage: 3 pools of 4, single RR       │
│ Semifinals: top 2 per pool + best 3rd      │
│ Final decides the champion                 │
│ RULES                               Edit   │
│ Win 2 · Tie 1 · NR 1 · Loss 0 · ICC NRR    │
│ Points → NRR → Head-to-head                │
│ POOLS                               Edit   │
│ A: Tigers, Lions, Eagles, Hawks            │
│ FIXTURES                            Edit   │
│ 18 group matches · 3 knockout matches      │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │           Confirm tournament           │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

---

## Tournament: `tournament/[tournamentId]/*`

### W-D1 · Dashboard: `index.tsx` (§49, §80), active state

```text
┌────────────────────────────────────────────┐
│ ‹  City Cup 2026                       ⋯   │
│ 12 teams · 3 pools · Groups + knockout     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ GROUP STAGE                     24 / 48    │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯   │
├────────────────────────────────────────────┤
│ LIVE NOW                                   │
│ M24 Lions v Tigers   LIO 142/4 (16.4)   ›  │
├────────────────────────────────────────────┤
│ NEXT MATCH                                 │
│ M25 Hawks v Eagles  Sun 14 Sep 10:00       │
│ Model Town Ground              [Start]     │
├────────────────────────────────────────────┤
│ STANDINGS · POOL A              Full ›     │
│ Pos Team        P  W  L NR Pts    NRR      │
│  1  Tigers  Q   3  3  0  0   6 +1.234      │
│  2  Lions       3  2  1  0   4 +0.512      │
│  3  Eagles      3  1  2  0   2 -0.231      │
│  4  Hawks   E   3  0  3  0   0 -1.402      │
│ Tigers have qualified for the Semifinal.   │
├────────────────────────────────────────────┤
│ RECENT RESULTS                   All ›     │
│ M23 Tigers beat Hawks by 22 runs           │
│ M22 Eagles v Pumas: no result              │
├────────────────────────────────────────────┤
│ Fixtures                               ›   │
│ Standings                              ›   │
│ Qualification                          ›   │
│ Bracket                                ›   │
│ Statistics                             ›   │
│ Pools · Stages · Teams                 ›   │
│ What if…                               ›   │
│ Audit log                              ›   │
│ Tournament settings                    ›   │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Header | Name `title2` (top bar), meta `footnote`; boundary rule |
| Current stage | `label` stage name + `scoreMedium`-style "24 / 48" (tabular) right; the progress rule is decorative (4 pt) |
| Live now | Only when a fixture is live/paused; row → `/match/[id]/score` |
| Next match | The earliest scheduled fixture with resolved sides; **Start** (`secondary sm`) → USER_FLOWS §4.4. Unresolved sides: "Waiting for Pool A winner" and no Start |
| Standings excerpt | The pool of the next/live match (else Pool A); the table per DESIGN_SYSTEM §6.5; the Q/E markers are text badges "Q"/"E" plus the explanation line; "Full" → standings |
| Recent results | The last 3 completed fixtures (`formatResult`) |
| Section index | ListRows (IA §6 rules for hidden rows) |
| Other states | IA §6: draft → "Continue setup"; completed → **Champion** block first: "CHAMPION" `label`, team `title1`, basis line `callout` |
| Warnings | `unresolvedTies` → warning banner under the header "Lions and Eagles can't be separated for 2nd in Pool A. [Resolve tie]"; `staleSummaryMatchIds` → info banner "Some results are being recalculated." |

### W-D2 · Standings: `standings.tsx` (§50, §51, §98)

```text
┌────────────────────────────────────────────┐
│ ‹  Standings                               │
│  Pool A │ Pool B │ Pool C │ Overall │ 3rds │
│ ━━━━━━━━                                   │
│ Pos Team        P  W  L NR Pts    NRR      │
├────────────────────────────────────────────┤
│  1▌Tigers       3  3  0  0   6 +1.234      │
│    Qualified ✓ · 1 match left              │
│  2 Lions        3  2  1  0   4 +0.512      │
│    In contention · 1 match left            │
│  3 Eagles       3  1  2  0   2 -0.231      │
│    In contention                           │
│  4 Hawks        3  0  3  0   0 -1.402      │
│    Eliminated ✕                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ HOW THIS TABLE IS DECIDED                  │
│ Top 2 qualify for the Semifinal. Best 3rd  │
│ across pools also qualifies.               │
│ Points → NRR → Head-to-head → Wins         │
├────────────────────────────────────────────┤
│ Tigers have mathematically qualified for   │
│ the Semifinal.                             │
│ Lions are ahead of Eagles on points.       │
│ Hawks cannot reach the top 2.              │
├────────────────────────────────────────────┤
│ Slots: A1 Tigers (provisional) · A2 Lions  │
│ (provisional)                              │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Tabs | One per pool, **Overall** (when > 1 pool), and one per comparison table ("Best 3rds") |
| Columns | §50: Pos, Team, P, W, L, NR, Pts, NRR. A **T** column is inserted after L only when any row has `tied > 0`. The team column shows the slot label for unresolved slot members ("A1") and "A1 · Tigers (provisional)" for provisional ones |
| Qualification | A second line under each row: the Badge (Qualified / In contention / Eliminated / Manual Override) + "Mathematical" or "Provisional" in text + matches remaining. A qualified row also gets the 3 pt `success` leading bar (redundant cue) |
| Shared position | "=2" in the Pos column when `sharedPosition` |
| Tie-break notes | `TieBreakNote.detail` as `footnote` under the row it explains ("Ahead of Lions on net run rate (+0.512 vs +0.231)") |
| Withdrawn / replaced rows | `textMuted` name + "(withdrawn)"; never a qualification badge |
| Explanations | The "How this table is decided" section: rule text, the tie-breaker chain, then each team's `explanation` (§98) |
| Large text | At font scale > 1.3 the table scrolls horizontally with a sticky team column (RESPONSIVE §5) |
| Column widths | Numeric columns use `COLUMN_WIDTH` from the design-system Table: 32 for 1–2 digits, 40 when any value in the column has 3 characters, and 64 for NRR. The team column is `flex: 1`. It gets the 120 minimum (scaled with the font, up to ×1.5) only in the horizontal-scroll layout, because 120 plus the fixed numeric columns does not fit a 360 dp phone |
| Points adjustments | A row whose `pointsAdjustment ≠ 0` gets a second line with the **Manual Override** badge, "Points adjusted by the organizer: −2 pts" and the override reason. The row's accessibility label adds "Manual Override: points adjusted by −2 pts" (§47, §54) |

### W-D3 · Fixtures: `fixtures/index.tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Fixtures                     [+ Add]    │
│ (•By round)( By date )    Status: All ▾    │
├────────────────────────────────────────────┤
│ GROUP STAGE · POOL A                       │
│ ROUND 3                                    │
│ M13 Tigers v Hawks                     ›   │
│     Tigers won by 22 runs · Sat 19 Sep     │
│ M14 Lions v Eagles        ● Live       ›   │
│     LIO 142/4 (16.4)                       │
│ M15 Pumas v Rhinos        Postponed    ›   │
│     was Sun 20 Sep · rain                  │
├────────────────────────────────────────────┤
│ SEMIFINALS                                 │
│ SF1 A1 v B2               Sat 3 Oct    ›   │
│     Waiting for pool results               │
│ F   Winner SF1 v Winner SF2  Sun 4 Oct ›   │
└────────────────────────────────────────────┘
```

Row: match number/label `tableNumeric`, sides `body` (slot labels until resolved; resolved-provisional "Tigers (A1)"), status badge, and a second line with the result, score or schedule. Filters: Stage, Pool, Status. **+ Add** → `fixtures/new`.

### W-D4 · Add match: `fixtures/new.tsx` (§37)

```text
┌────────────────────────────────────────────┐
│ ‹  Add match                               │
│ Stage          Group stage             ▾   │
│ Pool           Pool A                  ▾   │
│ Team A         Tigers                  ▾   │
│ Team B         Choose team or slot     ▾   │
│ Date           Sat 26 Sep              ▾   │
│ Time           10:00                   ▾   │
│ Venue          Model Town Ground       ▾   │
│ Format         Stage default (T20)     ▾   │
│ Overs          20                      ›   │
│ Label (optional)  e.g. Eliminator          │
│ Notes (optional)                           │
│ ┌────────────────────────────────────────┐ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│ This is the final of this stage      ○     │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │               Add match                │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

The side pickers have two segments, **Team** and **Slot** (slots of this stage with their labels). "This is the final of this stage" (custom stages only) sets `isFinal`. Adding to a stage with started matches goes through the impact sheet if the policy says `warn`.

### W-D5 · Fixture: `fixtures/[fixtureId].tsx` (§38, §39, §66)

```text
┌────────────────────────────────────────────┐
│ ‹  Match 25                            ⋯   │
│ Group stage · Pool A · Round 4             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ Hawks                                      │
│   v                                        │
│ Eagles                                     │
│ Scheduled · Sun 14 Sep 10:00               │
│ Model Town Ground · T20                    │
│ ┌────────────────────────────────────────┐ │
│ │              Start match               │ │
│ └────────────────────────────────────────┘ │
├────────────────────────────────────────────┤
│ SCHEDULE                                   │
│ Date & time    Sun 14 Sep 10:00        ›   │
│ Venue          Model Town Ground       ›   │
│ Format         T20 (stage default)     ›   │
│ Teams          Hawks v Eagles          ›   │
├────────────────────────────────────────────┤
│ Postpone        Cancel match               │
│ Walkover…       Award…                     │
└────────────────────────────────────────────┘
```

| State | Primary action | Other |
|---|---|---|
| Scheduled / rescheduled, sides resolved | **Start match** | Postpone, Cancel match, Walkover…, Award… |
| Sides unresolved | Disabled "Waiting for Winner SF1" + the slot explanation (`SlotResolution.explanation`). Pool-position slots are named by their meaning, not their code: "Waiting for Pool A winner and Pool B runner-up". The dashboard's next match uses the same words | Edit schedule |
| Provisional sides | **Start match** → Dialog "Start anyway?" (USER_FLOWS §4.4) | – |
| Postponed | **Reschedule** | Cancel match |
| Live | **Resume scoring** + live score line | – (edits forbidden, shown locked) |
| Completed | **View scorecard** + result line | Correct result → opens the scorecard edit path; "Stage / pool" move (confirm) |
| Abandoned | View scorecard | **Reschedule replay** (only when `replayAllowed`). When the abandoned fixture has a recorded match, the reschedule sheet shows a warning that the abandoned match stays in the match history and requires a reason (§55, §99). Since wave 3 the domain previews the replay: `previewChange({ kind: 'fixture_update', fixtureId, patch: { status: 'rescheduled', … } })` returns WHAT WILL CHANGE (the no result leaving the table, NRR and qualification changes), and `updateFixture(…, reason)` applies and audits that same impact. Showing the preview in this sheet is a tournament-ui follow-up |
| Cancelled | Restore | Delete |

Locked fields show a `lock` icon; a tap explains ("Played fixtures keep their date and teams").

### W-D6 · Pools: `pools.tsx` (§30–§34)

```text
┌────────────────────────────────────────────┐
│ ‹  Pools                                   │
│ Stage  Group stage ▾      [Re-draw pools]  │
├────────────────────────────────────────────┤
│ POOL A · 4 teams · 6 of 6 fixtures         │
│ Tigers        3 played                 ⋯   │
│ Lions         3 played                 ⋯   │
│ Eagles        3 played                 ⋯   │
│ Hawks         2 played                 ⋯   │
├────────────────────────────────────────────┤
│ POOL B · 3 teams                           │
│ Pumas         2 played                 ⋯   │
│ …                                          │
├────────────────────────────────────────────┤
│ Member ⋯ menu:                             │
│   Move to pool…                            │
│   Swap with…                               │
│   Replace with another team…               │
└────────────────────────────────────────────┘
```

Every action opens a picker and then the **WHAT WILL CHANGE** sheet (W-D16). Slot members (Super 8 groups built from "A1", "B2") show the slot label with the resolved team in `textSecondary`.

### W-D7 · Stages: `stages/index.tsx` (§29)

```text
┌────────────────────────────────────────────┐
│ ‹  Stages                      [+ Stage]   │
│ 1  Group stage                         ›   │
│    Groups · 3 pools · single RR · Active   │
├────────────────────────────────────────────┤
│ 2  Semifinals                          ›   │
│    Knockout · 4 entrants · Pending         │
│    ★ Decides the champion                  │
├────────────────────────────────────────────┤
│ 3  Plate                               ›   │
│    Knockout · pool 3rds and 4ths           │
└────────────────────────────────────────────┘
```

Row ⋯: Move up / Move down (only while no match has started), Delete stage (impact). "★ Decides the champion" is text + icon.

### W-D8 · Stage: `stages/[stageId].tsx` (§29, §44–§46)

```text
┌────────────────────────────────────────────┐
│ ‹  Semifinals                              │
│ Name           Semifinals              ›   │
│ Type           Knockout                ›   │
│ Match format   T20 · final 20 overs    ›   │
│ Decides the champion                 ●     │
├────────────────────────────────────────────┤
│ WHO ENTERS                                 │
│ Top 2 from each pool of Group stage    ›   │
│ Best 3rd across pools (per-match avg)  ›   │
│ + Add entry rule                           │
├────────────────────────────────────────────┤
│ SLOTS                                      │
│ 1  A1  Pool A winner       Tigers (prov.)  │
│ 2  B1  Pool B winner       pending         │
│ 3  A2  Pool A runner-up    Lions (prov.)   │
│ …                                          │
│ 5  Winner SF1              pending         │
├────────────────────────────────────────────┤
│ KNOCKOUT                                   │
│ Seeding   (•Fixed)( Random )( Ranking )    │
│ Third-place play-off                 ○     │
│ Tied match      Super over             ›   │
│ No result       Higher seed advances   ›   │
│ [ Generate bracket ]                       │
└────────────────────────────────────────────┘
```

Entry rule editor sheet: kind `Top N per pool · Pool position · Best of position · Top overall · Winners of a knockout · Chosen by organizer · Direct entry (teams)`, with its fields and a live sentence preview (`explainEntryRules`). Slot rows are `SlotResolution`: label, source text, and status (final / provisional / pending) in text. **Generate bracket** respects `knockoutGenerationGuard` (disabled with the reason "Ranking seeding needs the pools to finish").

### W-D9 · Qualification: `qualification.tsx` (§44–§47, §51, §98)

```text
┌────────────────────────────────────────────┐
│ ‹  Qualification                           │
│ For  Semifinals ▾                          │
│ Rule: top 2 per pool + best 3rd            │
├────────────────────────────────────────────┤
│ QUALIFIED                                  │
│ Tigers   A1 · Mathematical             ⋯   │
│   Tigers have mathematically qualified     │
│   for the Semifinal.                       │
├────────────────────────────────────────────┤
│ IN CONTENTION                              │
│ Lions    A2 · Provisional              ⋯   │
│   Lions are still in contention.           │
├────────────────────────────────────────────┤
│ ELIMINATED                                 │
│ Hawks    Mathematical                  ⋯   │
├────────────────────────────────────────────┤
│ MANUAL OVERRIDES                           │
│ ✎ Manual Override · Rhinos qualified       │
│   "Pool C washed out" · 12 Sep · Revoke    │
└────────────────────────────────────────────┘
```

Grouping is by state, so status is carried by section headers + badges + explanation text, never by colour. Row ⋯ → Qualify / Eliminate / Reassign to slot… / Adjust points… → the override sheet (reason required) → WHAT WILL CHANGE. A "For" picker appears when the stage feeds several downstream stages (Cup and Plate).

### W-D10 · Bracket: `bracket.tsx` (§46)

```text
┌────────────────────────────────────────────┐
│ ‹  Bracket                                 │
│ Semifinals ▾                               │
├────────────────────────────────────────────┤
│ SEMIFINALS            FINAL                │
│ ┌───────────────┐                          │
│ │ SF1 Sat 3 Oct │                          │
│ │ A1 Tigers  172│──┐                       │
│ │ B2 Pumas   150│  │  ┌───────────────┐    │
│ └───────────────┘  ├──│ F  Sun 4 Oct  │    │
│ ┌───────────────┐  │  │ Tigers        │    │
│ │ SF2 Sat 3 Oct │  │  │ Winner SF2    │    │
│ │ B1 Hawks      │──┘  └───────────────┘    │
│ │ A2 Lions      │                          │
│ └───────────────┘       CHAMPION  –        │
├────────────────────────────────────────────┤
│ Bye: seeds 1–2 advance directly (QF)       │
└────────────────────────────────────────────┘
```

Rounds are columns (180 pt wide) in a horizontal ScrollView, and connector lines are `border` hairlines. Match boxes: `surface`, 1 `borderStrong`, radius 6, each row = slot label `label` + team `subhead` + score `figureSmall`; the winner row is `bodyStrong` + `check`. A bye box reads "Bye" in `textMuted`. A third-place box sits under the final, labelled "Third place". A tap → the fixture. Accessibility order is round by round, then top to bottom (ACCESSIBILITY §6).

### W-D11 · What if: `what-if.tsx` (§48)

```text
┌────────────────────────────────────────────┐
│ ‹  What if…                                │
│ ▌ Simulation only. Nothing in the          │
│ ▌ tournament changes.                      │
├────────────────────────────────────────────┤
│ REMAINING · GROUP STAGE                    │
│ M25 Hawks v Eagles        Eagles win   ›   │
│ M26 Lions v Pumas         –            ›   │
│ M27 Tigers v Rhinos       No result    ›   │
├────────────────────────────────────────────┤
│ [ See outcome ]            Clear           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ────────────────────────────────────────── │
│ IF THESE RESULTS HAPPEN                    │
│ Eagles 3rd → 2nd · qualify as A2           │
│ Lions  2nd → 3rd · out unless best 3rd     │
│ Pos Team      P  W  L NR Pts   NRR   Δ     │
│  1  Tigers    4  3  0  1   7 +1.10   –     │
│  2  Eagles    4  2  2  0   4 +0.02  ▲1     │
│  3  Lions     4  2  2  0   4 -0.05  ▼1     │
└────────────────────────────────────────────┘
```

The hypothetical result sheet: outcome options (USER_FLOWS §4.8) + optional "Score" (runs/balls both innings, for NRR). The Δ column shows ▲/▼ glyph + number (text, not colour). There is no apply button anywhere on this screen.

### W-D12 · Statistics: `stats.tsx` (§52)

```text
┌────────────────────────────────────────────┐
│ ‹  Statistics                              │
│  Records │ Batting │ Bowling │ Teams       │
│ ━━━━━━━━━                                  │
│ Matches           24 of 48 played          │
│ Runs · Wickets    6,412 · 298              │
│ Fours · Sixes     612 · 187                │
├────────────────────────────────────────────┤
│ Highest score     214/5  Tigers v Hawks ›  │
│ Best batting      112*  Hamza Ali (TIG) ›  │
│ Best bowling      5-18  Hassan Ali (LIO)›  │
│ Most sixes        14    Bilal Asif (TIG)   │
│ Most fours        31    Hamza Ali (TIG)    │
│ Best partnership  148   Hamza & Bilal   ›  │
├────────────────────────────────────────────┤
│  (Batting tab:)                            │
│     Player        M   R   Avg    SR  4s 6s │
│  1  Hamza Ali     6 342  68.4 152.0 31 12  │
└────────────────────────────────────────────┘
```

Records rows link to the match scorecard. Batting/Bowling tabs are Tables with a sort picker (Runs, Average, SR / Wickets, Economy, Best), sticky player column, and horizontal scroll. No charts and no "stat cards" (§49).

### W-D13 · Audit log: `audit.tsx` (§53)

```text
┌────────────────────────────────────────────┐
│ ‹  Audit log                               │
│ Filter: All changes ▾                      │
├────────────────────────────────────────────┤
│ SUN 14 SEP                                 │
│ 16:05  Result corrected · M13              │
│        Tigers won by 22 → 18 runs          │
│        "Scorer missed a wide in over 17"   │
│        Impact: NRR changed for 2 teams  ▾  │
├────────────────────────────────────────────┤
│ 11:40  Team moved · Pumas Pool B → C       │
│        2 fixtures removed, 3 created    ▾  │
├────────────────────────────────────────────┤
│ SAT 13 SEP                                 │
│ 09:12  Manual Override · Rhinos qualified  │
│        "Pool C washed out"                 │
└────────────────────────────────────────────┘
```

Each entry: time `tableNumeric`, `AuditEvent.summary` `bodyStrong`, previous → new `callout`, reason in quotes `footnote`, and an expandable impact (the stored `ImpactSummary`, rendered with the W-D16 section components, read-only). Paged by `before` timestamp.

### W-D14 · Tournament teams: `teams.tsx` (§27, §33)

```text
┌────────────────────────────────────────────┐
│ ‹  Teams                       [+ Add]     │
│ 12 teams                                   │
├────────────────────────────────────────────┤
│ LIO  Lions         Seed 1   Pool A     ⋯   │
│ TIG  Tigers        Seed 2   Pool A     ⋯   │
│ HAW  Hawks         –        Pool B     ⋯   │
│ RHI  Rhinos        Withdrawn           ⋯   │
│      Results kept for opponents            │
├────────────────────────────────────────────┤
│ Team ⋯:  Change seed… · Replace with… ·    │
│          Withdraw… · View team             │
└────────────────────────────────────────────┘
```

Replace sheet: new team picker, seed, **"What happens to Lions' results?"** radio with explanations: *Transfer to the new team* ("Y takes over X's played results"), *Keep for opponents* ("X stays in the table as withdrawn; Y starts at zero"), *Remove them* ("every result involving X is expunged"). Then WHAT WILL CHANGE.

### W-D15 · Tournament settings: `manage.tsx`

```text
┌────────────────────────────────────────────┐
│ ‹  Tournament settings                     │
│ DETAILS                                    │
│ Name, season, dates, venues            ›   │
│ Rules: points, NRR, tie-breakers       ›   │
├────────────────────────────────────────────┤
│ STATUS · Active                            │
│ Complete tournament                    ›   │
├────────────────────────────────────────────┤
│ SHARE & KEEP                               │
│ Export PDF (standings, results)        ›   │
│ Back up this tournament (JSON)         ›   │
│ Save as template                       ›   │
├────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐ │
│ │           Delete tournament            │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

The status actions shown follow `canTransitionTournament`: Start (fixtures_generated → active), Complete, Reopen for correction (completed → active, reason), Archive / Unarchive. Rules edits go through the impact sheet. **Delete tournament**: `previewDelete` → Dialog with counts, **Back up first**, a typed-name field, and a checkbox "Also delete 18 completed matches" → `destructiveConfirm` "Delete tournament" (enabled only when the name matches and the checkbox is set when required).

### W-D16 · WHAT WILL CHANGE sheet (§34, §99)

```text
┌────────────────────────────────────────────┐
│                   ────                     │
│ What will change                       ✕   │
│ Moving Pumas to Pool C changes 5           │
│ fixtures and the Pool B and C tables.      │
│ ▌⚠ 2 completed matches are affected.       │
├────────────────────────────────────────────┤
│ FIXTURES                                   │
│ − M8  Pumas v Hawks (Pool B)   removed     │
│ − M11 Pumas v Tigers (Pool B)  removed     │
│ + Pumas v Rhinos (Pool C)      created     │
│ + Pumas v Owls (Pool C)        created     │
├────────────────────────────────────────────┤
│ STANDINGS                                  │
│ Hawks   Pool B  2nd → 1st · 4 → 4 pts      │
│ Rhinos  Pool C  1st → 2nd                  │
├────────────────────────────────────────────┤
│ QUALIFICATION                              │
│ Hawks   In contention → Qualified          │
├────────────────────────────────────────────┤
│ Net run rate changes for 4 teams.          │
│ Reason (required)                          │
│ ┌────────────────────────────────────────┐ │
│ │ Pumas asked to play on Sundays         │ │
│ └────────────────────────────────────────┘ │
│ ┌──────────────────┐ ┌───────────────────┐ │
│ │      Cancel      │ │     Continue      │ │
│ └──────────────────┘ └───────────────────┘ │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Headline | `impact.headline` `headline`; then `impact.lines` as `callout` |
| Severity banner | `warning` → warningSubtle banner; `destructive` → dangerSubtle banner + Continue becomes `destructiveConfirm` "Apply changes" |
| Fixture lines | A leading "+" / "−" / "~" **text glyph** + label + change word; `hasMatchData` adds "(has scores)" in `warning` |
| Standings | Position/points/NRR before → after, text arrows |
| Slots | "A1: Tigers → Lions"; played fixtures: "SF1 was played as Tigers v Pumas. The result stands." |
| Blocked | Only [Close] + `blocked.reason` |
| Reason | Shown when `requiresReason`; Continue is disabled until filled |
| Height | Full-height sheet (90%), content scrolls, footer sticky |

---

## Settings stack: `settings/*`

### W-X1 · Backup & import: `settings/backup.tsx` (§84)

```text
┌────────────────────────────────────────────┐
│ ‹  Backup & import                         │
│ EXPORT                                     │
│ Export all data                        ›   │
│   Teams, matches, tournaments, settings    │
│   as scorebook-backup-2026-09-30.json      │
├────────────────────────────────────────────┤
│ IMPORT                                     │
│ Choose a backup file…                  ›   │
├────────────────────────────────────────────┤
│  (after choosing a file:)                  │
│ city-cup.json · exported 28 Sep            │
│ ✓ File is valid · 1 tournament, 24 matches │
│ ⚠ Imported before on 29 Sep                │
│ ALREADY ON THIS PHONE                      │
│ Tournament City Cup 2026                   │
│   3 matches exist only on this phone       │
│ IF ITEMS ALREADY EXIST                     │
│ (•) Skip them                              │
│ ( ) Import as a copy                       │
│ ( ) Replace mine (3 local matches lost)    │
│ ┌────────────────────────────────────────┐ │
│ │                 Import                 │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

Invalid files show an ErrorState block listing `BackupIssue.message`s (errors first), and Import is hidden. "Replace mine" shows the local-only counts in `danger` text and asks for a Dialog confirmation. Never silently overwrite (§84).

### W-X2 · Format presets: `settings/presets.tsx` (§8)

```text
┌────────────────────────────────────────────┐
│ ‹  Format presets              [+ New]     │
│ BUILT-IN                                   │
│ T5    5 overs · 11 a side              ›   │
│ T10   10 overs                         ›   │
│ T20   20 overs · powerplay 1-6         ›   │
│ …                                          │
├────────────────────────────────────────────┤
│ YOURS                                      │
│ Gully 8   8 overs · 8 a side · LMS     ›   │
└────────────────────────────────────────────┘
```

Built-ins open read-only with **Duplicate to edit**. Custom presets open the same rule editor as W-M1. The note reads "Changing a preset never changes past matches."

### W-X3 · Diagnostics: `settings/diagnostics.tsx` (§86, §93)

```text
┌────────────────────────────────────────────┐
│ ‹  Diagnostics                             │
│ Database version        1                  │
│ Last start              30 Sep 09:12       │
│ Results recalculated    0                  │
├────────────────────────────────────────────┤
│ MATCHES THAT NEED REPAIR                   │
│ Pakistan XI v Lions · event 214        ›   │
├────────────────────────────────────────────┤
│ CHECKS                                     │
│ [ Check data links ]                       │
│ Last check: no problems found              │
├────────────────────────────────────────────┤
│ Copy technical details                     │
└────────────────────────────────────────────┘
```

"Check data links" runs the on-demand foreign-key check. The results use plain language ("All links between matches, teams and tournaments are intact"). Technical details (codes, `ServiceError.detail`) are only in the copied text.

