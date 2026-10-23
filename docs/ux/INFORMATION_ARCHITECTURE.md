# Scorebook — Information Architecture

Spec: §5, §61, §79–§82, §100. The sitemap below matches the Expo Router route map in [ARCHITECTURE.md §9](../architecture/ARCHITECTURE.md) one-to-one: every screen is a route file, and every route file is a screen. Surfaces that are *not* routes (sheets, dialogs, panels) are listed in §4. Screen layouts are in [WIREFRAMES.md](WIREFRAMES.md), and step-by-step journeys in [USER_FLOWS.md](USER_FLOWS.md).

## 1. Structure principles

1. **Two front doors, one engine** (§5, §66). Home offers **NEW MATCH** and **Continue Match**; Tournaments offers the competitions. A match started from either door opens the same `/match/[matchId]/*` screens. No tournament-specific scoring UI exists.
2. **Scoring is never more than one tap from launch.** A live match surfaces as the §23 resume prompt, then as the Home "Continue Match" block, then in History (filter: Live).
3. **Hub and spoke for tournaments.** The tournament dashboard is the hub. Every tournament screen is one tap from it and returns to it. There are no deep cross-links between spokes, except "open the fixture/match this row refers to".
4. **Shallow stacks.** Maximum depth from a tab root is 3, for example Tournaments → Dashboard → Fixture → Match scoring. Wizards are their own stacks and are replaced by their result on completion (`router.replace`), so Back never re-enters a finished wizard.
5. **State decides emphasis, not navigation.** The same routes exist in every tournament state. The dashboard reorders its sections by `TournamentStatus` (§6), and forbidden edits appear as read-only fields with the reason, never as missing screens (STATE_MACHINES.md edit policies).
6. **Automation is always explained in place** (§98). Standings, qualification, bracket and impact screens show *why* next to *what*. Explanations are not on a separate help screen.

## 2. Global navigation

```
Root stack (src/app/_layout.tsx) ── fonts · ThemeProvider · bootstrap gate · Toast host
├── (tabs)  ─ Bottom tab bar, 4 items (§5):
│   ├── Home          house     → /
│   ├── Tournaments   trophy    → /tournaments
│   ├── History       history   → /history
│   └── Settings      settings  → /settings
├── match/new/*              (modal-style stack, presented over tabs)
├── match/[matchId]/*        (full-screen stack; the scoring screen hides the tab bar)
├── teams/*                  (pushed stack)
├── tournament/new/*         (modal-style stack)
├── tournament/[tournamentId]/*  (pushed stack)
└── settings/*               (pushed stack)
```

- The tab bar is visible only on the four tab roots. Every pushed stack hides it, so the live scoring screen gets the whole height (§9).
- Wizards (`match/new`, `tournament/new`) present with `presentation: 'modal'` on iOS (Android: slide from bottom). Their top bar has **Close** (`x`) on the left instead of Back. On Close, the match wizard asks "Discard this setup?" if the draft is not empty. The tournament wizard saves progressively (`saveStep`), so Close says "Your draft is saved. Continue it from Tournaments." and does not ask.
- The Android hardware back button behaves like Back/Close. On the live scoring screen, Back leaves the match (it stays live; nothing is lost because every ball is committed). **It never undoes a ball.**
- Deep link scheme is `scorebook://` (from `app.json`). No external links exist, because the app is offline (§85), so deep links are used only by Expo Router internally and in E2E tests.

## 3. Sitemap

Legend: **Route** · Screen name (as shown in the top bar) · Purpose · Main data (store) · Entry points · Spec.

### 3.1 Tabs

| Route | Screen | Purpose | Data | Entry points | § |
|---|---|---|---|---|---|
| `(tabs)/index.tsx` → `/` | **Scorebook** (Home) | Start or continue scoring. Recent matches, tournaments at a glance. Hosts the §23 resume prompt on launch | `useHomeStore` (resumable, recent, tournaments), `useAppStore.report` | App launch, tab | §5, §23, §79 |
| `(tabs)/tournaments.tsx` → `/tournaments` | **Tournaments** | List with filter Active · Drafts · Completed; create | `useTournamentListStore` | Tab, Home "See all" | §82 |
| `(tabs)/history.tsx` → `/history` | **History** | Segment **Matches** (search, filter, sort, view, delete, export) · segment **Tournaments** (completed and archived: name, teams, status, champion) | `useMatchHistoryStore`, `useTournamentListStore` | Tab, Home "See all" | §5, §81, §82 |
| `(tabs)/settings.tsx` → `/settings` | **Settings** | Appearance, scoring preferences, feedback, library (teams, presets), data, about | `useSettingsStore` | Tab | §5, §70, §76, §77 |

### 3.2 Match setup wizard: `match/new/*` (§6–§8, §64)

A single store (`useMatchSetupStore`) holds the draft in memory. Steps are linear, and Back returns to the previous step with the values kept. A step header shows "Step n of 5" and a five-segment progress rule.

| Route | Screen | Purpose | Next |
|---|---|---|---|
| `match/new/index.tsx` | **New match** | Title, format preset (T5…T50, Custom), overs (quick picks + typed), date/time, venue, rules summary with per-rule editing | teams |
| `match/new/teams.tsx` | **Teams** | Team A and Team B from the library, or create inline. Uneven side sizes under "Advanced" | players |
| `match/new/players.tsx` | **Players** | Squads per team (tabs A/B): select, batting order, captain, keeper, substitute fielders | toss |
| `match/new/toss.tsx` | **Toss** | Winner and decision, or "Toss not recorded" | openers |
| `match/new/openers.tsx` | **Openers** | Striker, non-striker, opening bowler → **Start match** creates the match *and* the first innings in one transaction | `router.replace('/match/[id]/score')` |

Entry points: Home **NEW MATCH**; Tournament fixture **Start match** (see §3.4). A fixture entry pre-fills title, teams, format and rules from the fixture/stage and locks the teams (`startFromFixture`).

**Route parameter convention (proposed):** `match/new?tournamentId=…&fixtureId=…`. ARCHITECTURE §9 does not specify how the wizard receives a fixture; `useMatchSetupStore.startFromFixture(tournamentId, fixtureId)` implies these two params.

### 3.3 Match: `match/[matchId]/*` (§9–§23, §64, §83)

`_layout.tsx` opens the match in `useLiveMatchStore` once, and every child reads it. The screens are siblings in one stack with the scoring screen as its root. From Home's Continue Match or the resume prompt the stack opens at `score`; from History or a completed fixture it opens at `scorecard`.

| Route | Screen | Purpose | Reached from |
|---|---|---|---|
| `score.tsx` | **Live scoring** (top bar: "PAK v LIO · T20") | §73 hierarchy; 8-key pad; pending-action panels; More sheet | Wizard, resume prompt, Continue Match, fixture "Resume scoring" |
| `scorecard.tsx` | **Scorecard** | Result, toss, innings tabs, batting, bowling, extras, FoW, partnerships, over summary; Share PDF | Live scoring More → Scorecard; tablet left pane; History row; completed fixture; confirm-result "View scorecard" |
| `balls.tsx` | **Ball by ball** | Scorebook-grid log per innings/over; tap a ball → edit | Scorecard "Ball by ball"; live More → "Ball by ball" |
| `edit/[seq].tsx` | **Edit ball 17.3** | Replace, delete, or insert before a delivery; WHAT WILL CHANGE preview; reason; apply | Ball log tap; scorecard over-summary tap |
| `analytics.tsx` | **Analytics** | Worm, Manhattan, partnerships, scoring breakdown | Scorecard "Analytics"; post-match |
| `manage.tsx` | **Match settings** | Details, rules (confirm), toss (confirm), squads (add players and substitutes), revise overs, suspend/resume, end match (abandon / no result / award), DISCARD / delete | Live More → "Match settings"; scorecard ⋯ |

Pre-play screens (status `scheduled`/`postponed`) only exist for tournament fixtures that have not started. They are handled by the fixture detail, never under `/match/[id]`.

### 3.4 Tournament creation wizard: `tournament/new/*` (§25, §65)

Seven steps, saved progressively (`useTournamentWizardStore.saveStep`), so a draft is a real tournament row in status `draft` → … → `fixtures_generated`. Drafts appear in Tournaments → Drafts and resume at their last step (`resume`).

| Route | Screen | Purpose | Tournament status after save |
|---|---|---|---|
| `tournament/new/index.tsx` | **Tournament details** | Name, season, organizer, dates, venues, description (§26) | `draft` → `registration` |
| `tournament/new/teams.tsx` | **Teams** | Pick or create teams, optional seeds (§27) | `registration` |
| `tournament/new/structure.tsx` | **Format** | Template (5 built-ins + saved) or League / Groups / Knockout / Groups + knockout / Custom; stage list (§28, §29, §56) | `structure_configured` (with rules) |
| `tournament/new/rules.tsx` | **Rules** | Points, NRR mode, tie-breaker order, default match format (§40–§43) | — |
| `tournament/new/pools.tsx` | **Pools** | Pool count and sizes; Random (seed) / Seeded / Manual; preview; uneven warning; replace warning plus undo (§30–§32) | `pools_configured` |
| `tournament/new/fixtures.tsx` | **Fixtures** | Generate (single/double/custom legs) → preview → edit → per-pool regenerate (§35, §36) | — |
| `tournament/new/review.tsx` | **Review** | Summary of every step with Edit links → **Confirm tournament** | `fixtures_generated` → `router.replace('/tournament/[id]')` |

### 3.5 Tournament: `tournament/[tournamentId]/*` (hub and spokes)

`_layout.tsx` opens `useTournamentStore` (snapshot + evaluation). The dashboard is the stack root.

| Route | Screen | Purpose | § |
|---|---|---|---|
| `index.tsx` | **Dashboard** (tournament name as title) | Current stage, progress 24/48, next match, live match, standings excerpt, recent results, champion; section index | §49, §80 |
| `standings.tsx` | **Standings** | Pool tabs + Overall; Pos Team P W L NR Pts NRR (T when any tie); qualification labels and explanations; tie-break notes; comparison tables (best runners-up) | §50, §51, §98 |
| `fixtures/index.tsx` | **Fixtures** | By Stage → Round, or by Date; status filter; slot labels until resolved | §35–§39 |
| `fixtures/new.tsx` | **Add match** | Manual fixture: stage, pool, sides (team or slot), date, time, venue, format, overs, notes | §37 |
| `fixtures/[fixtureId].tsx` | **Match 12** (fixture label) | Details and edit; postpone / reschedule / cancel / restore; **Start match** / Resume scoring / View scorecard; walkover / award | §38, §39, §66 |
| `pools.tsx` | **Pools** | Pool membership per stage; move / swap / replace with impact preview; re-draw | §30–§34 |
| `stages/index.tsx` | **Stages** | Ordered stage list; add, reorder (before play), which stage decides the champion | §29 |
| `stages/[stageId].tsx` | **Stage: Knockouts** | Type, format, points/tie-breaker overrides, entry rules → slots, knockout config, fixture generation | §29, §44, §45, §46 |
| `qualification.tsx` | **Qualification** | Per downstream stage: every team's status with §98 explanation; slot resolutions; overrides (qualify, eliminate, reassign, slot, tie resolution, points adjustment, champion) | §44–§47, §51, §98 |
| `bracket.tsx` | **Bracket** | Knockout rounds, byes, slot labels, results, champion | §46 |
| `what-if.tsx` | **What if** | Choose hypothetical results of unplayed fixtures → simulated tables and qualification; never saved | §48 |
| `stats.tsx` | **Statistics** | Tournament records, team table, batting and bowling leaders | §52 |
| `audit.tsx` | **Audit log** | Chronological changes with previous → new value, reason, previewed impact | §53 |
| `teams.tsx` | **Teams** | Tournament teams, seeds, membership status; withdraw / replace / add late team | §27, §33 |
| `manage.tsx` | **Tournament settings** | Info, rules (with impact), status (start / complete / reopen / archive / unarchive), save as template, export PDF, back up this tournament, delete | §26, §55, §56, §62, §82 |

### 3.6 Teams library: `teams/*` (§27)

| Route | Screen | Purpose | Entry points |
|---|---|---|---|
| `teams/index.tsx` | **Teams** | Library of teams (search, archived toggle), + New team | Settings → Library → Teams & players; "Manage teams" link in match setup Teams step and tournament wizard Teams step |
| `teams/[teamId].tsx` | **Team name** | Name, short name, captain, players (name, jersey, role), archive | Teams list; player picker "Edit team" |

ARCHITECTURE §9 does not place `/teams` under any tab. This IA puts it under **Settings → Library** and under contextual links in both wizards.

### 3.7 Settings stack: `settings/*`

| Route | Screen | Purpose | § |
|---|---|---|---|
| `settings/backup.tsx` | **Backup & import** | Export full backup (JSON) → share; Import: pick file → preview (issues, counts, conflicts per aggregate, previously imported) → policy → apply | §84 |
| `settings/presets.tsx` | **Format presets** | Built-in T5…T50 (view), custom presets (create/edit/delete) | §8 |
| `settings/diagnostics.tsx` | **Diagnostics** | Schema version, last bootstrap report, integrity issues, matches needing repair, run foreign-key check, copy technical details | §86, §93 |

### 3.8 Root states (not routes)

`_layout.tsx` renders one of these before any route:
- **Splash** (native splash, obsidian `#070E12`, §107) while fonts load and `bootstrap()` runs (migrations, projection rebuild, replay of live/paused matches).
- **Bootstrap error** (full-screen ErrorState). For example, a migration failure: "Scorebook couldn't open your data. Nothing has been changed. [Try again]", plus "Technical details" (expandable, copyable). The Diagnostics route is not reachable yet, so details are inline.

## 4. Non-route surfaces

These are modal surfaces owned by a screen. They are listed here so the inventory is complete.

| Surface | Type | Owner screen | Trigger |
|---|---|---|---|
| Resume prompt "MATCH IN PROGRESS" | Blocking bottom sheet | Home | Launch with `findResumable({forPrompt:true})` non-empty |
| Extras sheet (Wide · No ball · Bye · Leg bye · Other) | Sheet | Live scoring, Edit ball | EXTRAS key |
| Wicket sheet (delivery type, dismissal, fielder, next batter, run-out details) | Sheet | Live scoring, Edit ball | WICKET key |
| Next batter panel | Blocking panel (replaces pad) | Live scoring | `pendingAction.type = select_next_batter` |
| Next bowler panel | Blocking panel | Live scoring | `select_next_bowler` |
| Innings break panel (openers for the next innings) | Blocking panel | Live scoring | `start_next_innings` |
| Play suspended panel | Blocking panel | Live scoring | `resume_play` |
| Confirm result panel | Blocking panel | Live scoring | `confirm_result` |
| Tied match panel (super over / accept tie / decide otherwise) | Blocking panel | Live scoring | `resolve_tie` |
| Retirement advisory banner | Inline banner | Live scoring | `state.retirementsDue` non-empty |
| Needs repair banner | Inline banner | Live scoring, Scorecard | `state.needsRepair` |
| More sheet (Scorecard, Ball by ball, Swap strike, Change bowler, Retire batter, Off-ball dismissal, Penalty runs, Suspend play, Revise overs, End innings, Match settings) | Sheet | Live scoring | More (`ellipsis`) |
| Player picker (single / multi, with "Add player") | Sheet | Setup, scoring panels, fixtures | Many |
| WHAT WILL CHANGE (impact preview) | Full-height sheet | Pools, Teams, Stages, Fixture detail, Qualification, Manage, Edit ball | Any warn/confirm change (§34, §99) |
| Reason entry | Inside the impact sheet or a Dialog | Same | `requiresReason` |
| Destructive confirm (DISCARD, delete, withdraw) | Dialog | Various | Destructive buttons |
| Typed-name confirm (delete tournament) | Dialog | Tournament settings | Delete |
| Override editor | Sheet | Qualification, Standings | "Override…" |
| Hypothetical result editor | Sheet | What if | Tap fixture |
| Fixture editor (in preview) | Sheet | Wizard Fixtures, Stage | Tap draft fixture |
| Toasts | Global host | Any | Store `show` |

## 5. Labels and vocabulary

The UI uses cricket and organizer language, never type names. One term per concept everywhere:

| Domain | UI label | Notes |
|---|---|---|
| `Pool` | **Pool** ("Pool A") | Same word in the UI and the schema. A "Group" stage type is displayed as "Group stage" |
| `StageSlot` (entry) | **Slot label as given** ("A1", "Best runner-up", "Winner SF1") | Unresolved slot rows render the label; provisional ones render "A1 · Tigers (provisional)" |
| `Fixture` | **Match n** / **Fixture** | The list title is "Fixtures"; one fixture is "Match 12" or its label ("SF1", "Final") |
| `MatchStatus` + `MatchResult` | `matchStatusLabel` output | Scheduled, Live, Paused, Postponed, Cancelled, Completed, Tied, No Result, Walkover, Abandoned |
| `TournamentStatus` | Draft · Setting up · Ready · Active · Completed · Archived | Draft = `draft`; Setting up = `registration`, `structure_configured`, `pools_configured`; Ready = `fixtures_generated` |
| `pendingAction confirm_result` | **Confirm result** | "The match is over. Confirm to update standings." |
| `overs_revised` | **Revise overs** | "Overs reduced" in the log |
| `penalty_awarded` | **Penalty runs** | |
| `play_suspended` | **Suspend play** / "Play suspended: rain" | |
| `TournamentOverride` | **Manual Override** (§47) | Badge text exactly "Manual Override" |
| `ImpactSummary` | **What will change** | Sheet title |
| `needsRepair` | **Needs repair** | "This match needs repair. Edit or undo the ball shown below." |
| Substitute fielder | **Substitute fielder** ("sub") | |
| NRR | **NRR** (header), "net run rate" (spoken) | |

## 6. Dashboard emphasis by tournament state

| Status | First section on the dashboard | Other sections (order) |
|---|---|---|
| `draft` … `pools_configured` | "Setup in progress: step n of 7" with **Continue setup** (opens the wizard at `step`) | Teams (count), Format |
| `fixtures_generated` | "Ready to start: 0 of 48 played" + **Next match** with **Start match** | Standings (all zero), Fixtures |
| `active` | Current stage + progress `24/48` + **Live match** (if any) + **Next match** | Standings excerpt (current pool or next-stage slots), Recent results, Qualification notes |
| `completed` | **Champion** (team name, basis: "Won the final by 5 wickets" / "Top of the table" / "Shared title" / "Manual Override") | Final standings, Bracket, Statistics, Export PDF |
| `archived` | Champion + "Archived: read only. Unarchive in Tournament settings." | Same as completed, with no edit entry points |

The section index at the bottom of the dashboard (Fixtures · Standings · Qualification · Bracket · Statistics · Pools · Stages · Teams · What if · Audit log · Tournament settings) is always present. Rows that do not apply are hidden with a stated reason, never shown disabled: Bracket appears only when a knockout stage exists, Pools only when a stage has more than one pool.

## 7. Search and filtering locations

| Where | Search | Filters | Sort |
|---|---|---|---|
| History → Matches | title, team names (`MatchListQuery.search`) | Status (All · Live · Completed · Scheduled · Abandoned), Team, Tournament | Recent · Oldest · Scheduled |
| History → Tournaments | name | Completed · Archived | Recent |
| Tournaments tab | name | Active · Drafts · Completed | Recent |
| Teams library | name | Show archived | A–Z |
| Tournament fixtures | team name | Stage, Pool, Status (Upcoming · Live · Completed · Postponed · Cancelled) | By round · By date |
| Player pickers | name / jersey | – | Batting order, then name (`eligibleIncomingBatters` order) |

## 8. Content priority on key screens

| Screen | 1 | 2 | 3 | 4 | Never shown |
|---|---|---|---|---|---|
| Live scoring (§73) | Score | Overs | Batters (striker marked) | Bowler | Tournament data, charts |
| Home (§79) | NEW MATCH | Continue Match (team, score, overs) | Recent (result lines) | Tournaments (progress, next match) | Statistics tiles |
| Dashboard (§49) | Name + current stage | Progress 24/48 | Next / live match | Standings | A card per statistic |
| Scorecard (§83) | Result line | Innings totals | Batting | Bowling | Charts (in Analytics) |
| Standings (§50) | Table | Qualification labels | Explanation lines | Tie-break notes | Colour-only markers |
