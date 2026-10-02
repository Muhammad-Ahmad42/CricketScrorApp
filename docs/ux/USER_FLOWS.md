# Scorebook — User Flows

Spec: §64 (standalone match), §65 (tournament), §66 (match → tournament), plus §15, §16, §17, §18, §23, §31, §34, §99. Screens are named as in [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md), and layouts are in [WIREFRAMES.md](WIREFRAMES.md). Each step lists **what the user does**, **what the system does** (store → service call from `src/stores/contracts.ts` / `src/services/contracts.ts`), and **failure branches**.

**Tap counting** counts only the taps that change state or choose a value, starting from the idle live-scoring screen. Scrolling and reading are not taps.

## 0. Conventions shared by every flow

- **Commit feedback.** A scoring tap's result is shown only after `useLiveMatchStore.dispatch` resolves `true`. The store serialises dispatches, so a second quick tap is queued, not dropped (ARCHITECTURE §5.1). Haptics follow the committed event (DESIGN_SYSTEM §9).
- **Save failure** (`dispatch` → `false`, `store.error`). An error toast appears at the top of the scoring screen: "Couldn't save this delivery. Your previous match data is still safe." [Try again]. Try again re-dispatches the same intent. The score on screen never shows the unsaved ball (§86).
- **CONFLICT** (a stale `expectedLastSeq`, e.g. the same match opened on a second screen). The store reloads the match. Toast: "This match was updated elsewhere. Showing the latest score." The redo stack is cleared.
- **Needs repair** (`state.needsRepair`). The pad is replaced by a danger banner: "This match needs repair. One recorded event can't be applied: 17.3 (Hassan to Ali). [Review ball]". Review ball opens `edit/[seq]` for the first error issue. Undo stays available. Every other write is refused by services (`FORBIDDEN_STATE`).
- **Impact preview** is the §34/§99 sheet "WHAT WILL CHANGE" (flow T-X, §4.9). Every tournament edit with policy `warn` or `confirm` goes through it. `allowed` edits apply directly with a success toast.
- **Reason** is required when `ImpactSummary.requiresReason` or `HistoryEditPreview.requiresReason` is true, and also whenever the edit policy of the change is `confirm` (STATE_MACHINES §3: confirm = impact preview + explicit confirmation + reason). The UI maps each `ProposedChange` to its policy column the same way the domain guard does (`pools`, `removeTeams`, `seeds`, `stages`, `generateFixtures`, `fixtureTeams`/`fixtureSchedule`, `matchResults`, `rules`, `overrides`). For example, a pool move or a rules change after completed matches needs a reason even when the impact itself touches no completed match. The Continue button stays disabled until at least 3 non-space characters are typed. The same 3-character rule applies to every reason field (overrides, tie resolution, cancel, reopen).
- **Re-review after CONFLICT** rebuilds the change from the refreshed tournament, not from the data on screen when it was first built. For example, a pool move recomputes `removeFixtureIds` / `addFixtures`, so a fixture played in the meantime is never removed.

---

## 1. Standalone match: §64 end to end

`Home → New Match → Match Information → Teams → Players → Toss → Opening Batters → Opening Bowler → Live Scoring → Innings Complete → Second Innings → Match Complete → Scorecard → Analytics → Share/Export`

| # | Screen | User | System | Failure / edge |
|---|---|---|---|---|
| 1 | Home | Taps **NEW MATCH** | `useMatchSetupStore.reset()`; push `match/new` (modal) with the default format from `settings.defaultFormatId` | – |
| 2 | New match | Optional title (placeholder "Team A v Team B" fills in after teams are chosen). Picks a format chip (T20 preselected) or **Custom**. Picks overs from quick picks `1 2 5 6 10 20 25 30 40 50` or types e.g. `17` in the custom field. Optional date, time, venue. Optionally opens a rule row (players per side, balls per over, bowler max overs, wides, no-balls, powerplay, super over, last man stands, mandatory retirement, bowler quota) | `update({formatId, rules})`. Changing overs re-derives the bowler max from `rulesForOvers` (shown, editable). Rule rows show the current value as the trailing text | Overs 0 or empty → inline error "Enter the number of overs (1 or more)"; Next disabled. `validateRules` errors appear under the offending row |
| 3 | Teams | Taps **Team A** → team picker sheet (search, recent first, **+ New team** with name + short name) → picks. Same for Team B | `update({teamAId, teamBId})`. Same team twice is excluded from the second picker | No teams in the library: the picker opens directly on "New team" |
| 4 | Players | Tab A: checks players (the checklist shows "9 of 11 selected"); **+ Add player** inline (name, jersey optional). Marks C (captain) and WK (keeper) via row toggles. Optional "Batting order" mode: ↑/↓ buttons per row. Optional **Substitute fielders** section. Tab B the same | `update({squadA, squadB, substitutesA/B})`. Selection order becomes the batting order when none is set | Fewer players than `playersPerSide`: warning (not blocking) "Lions have 9 of 11 players. The innings ends at 8 wickets." (uses the per-team side size). Fewer than 2 → Next disabled |
| 5 | Toss | Taps the toss winner (two large options with team names), then **Bat** or **Bowl** | `update({toss})`. The batting team for innings 1 is shown as a sentence: "Lions will bat first" | "Toss not recorded" link → `toss: null`; the next step asks who bats first |
| 6 | Openers | Taps **Striker** → picker (batting squad, no substitutes), **Non-striker** → picker, **Opening bowler** → picker (fielding squad) | Pickers exclude the already chosen batter and substitutes | Start disabled until all three are set |
| 7 | Openers | Taps **Start match** | `submit()` → `MatchService.createMatch(input, [innings_started])` in one transaction → `router.replace('/match/[id]/score')` | Failure → error toast "Couldn't create the match. Nothing was saved. [Try again]"; the draft is kept |
| 8 | Live scoring | Scores balls (flows 2.x). Overs end → bowler prompt (2.5) | `dispatch(intent)` per tap | See §0 |
| 9 | Live scoring | Innings ends (all out, overs complete, declared) | `pendingAction = start_next_innings` → **Innings break panel**: "Pakistan XI 168/7 (20 ov). Lions need 169 runs from 120 balls." with pickers for striker, non-striker and bowler, preselected empty | `confirmInningsEnd` preference on: the panel first asks "End of innings?" [Undo last ball] [Continue], guarding against a mis-tapped last ball |
| 10 | Live scoring | Picks openers → **Start 2nd innings** | `dispatch({type:'start_innings', …})` | – |
| 11 | Live scoring | Chase proceeds; the header shows Target, "Need 23 from 14 balls", RRR | Values from `state.chase` + `formatRequirement` | – |
| 12 | Live scoring | Winning run scored | `pendingAction = confirm_result` → **Confirm result panel**: result text (`state.resultText`), e.g. "Lions won by 5 wickets (12 balls left)", with [Confirm result] primary and [Undo last ball] tertiary | A tie with super overs enabled → `resolve_tie` panel (flow 2.10) |
| 13 | Live scoring | Taps **Confirm result** | `dispatch({type:'end_match', outcome:{type:'natural'}})` → lifecycle `completed`; haptic success; result animation | – |
| 14 | Scorecard | Automatically `router.replace` to `scorecard` after 800 ms, or at once via the "View scorecard" button | Result banner, innings tabs | – |
| 15 | Analytics | Taps **Analytics** in the scorecard header | Worm, Manhattan, partnerships | – |
| 16 | Scorecard | Taps **Share** → sheet: **PDF scorecard** / **Backup file (JSON)** | `ExportService.scorecardPdf(matchId)` → `share(uri, 'application/pdf')`; or `BackupService.exportBackup({kind:'match', matchId})` → share | "Couldn't create the PDF. Your match is safe. [Try again]" (EXPORT_FAILED) |

**Minimum taps from Home to the first ball** with an existing library and T20 defaults: NEW MATCH (1), Next (2), Team A + pick (4), Team B + pick (6), Next (7), [Select all] A (8), tab B (9), [Select all] B (10), Next (11), toss winner (12), Bat (13), Next (14), striker (16), non-striker (18), bowler (20), Start (21). About 21 taps, and none of them happens during play.

---

## 2. Live-scoring micro-flows (§9–§21)

### 2.1 Normal ball: one tap (§2 "Speed")

| Tap | Action | Result |
|---|---|---|
| 1 | `0` `1` `2` `3` `4` `6` | `dispatch(scoreRuns(n))` → chip appears in the over strip, score rolls, striker changes on odd runs (derived), haptic tier (DESIGN_SYSTEM §9) |

A **5**, **7**, all-run four, overthrows or short runs go through EXTRAS → **Other** (§2.3).

### 2.2 Wicket flow: ≤ 3 taps (§18)

**WICKET** opens the wicket sheet (WIREFRAMES §W-S3). Its top rows are pre-filled:
- **Delivery**: segmented `Fair · Wide · No ball` (default Fair). The dismissal list is filtered by `allowedDismissals(call, isFreeHit)`, so impossible options never appear. On a free hit, only Run out and the rare types show, with the note "Free hit: only run out and obstruction are possible".
- **Next batter**: row "Next in: **Shoaib Malik** ▾", preselected to `candidates[0]` (batting order, then name; `eligibleIncomingBatters`). Tapping it opens the list; "Choose later" is at the bottom. If this is the last wicket (`candidates` empty or the innings will be all out), the row reads "Last wicket: innings ends" and has no picker.

The final required choice commits: one `dispatch(wicket({...nextBatterId}))` → `[delivery, batter_in]` under one `actionId`, so Undo reverses both together (§15).

| Dismissal | Taps | Sequence | What commits |
|---|---|---|---|
| Bowled | **2** | WICKET → **Bowled** | `{dismissal:'bowled', nextBatterId: preselected}` |
| LBW | **2** | WICKET → **LBW** | same |
| Hit wicket | **2** | WICKET → **Hit wicket** | same |
| Caught | **3** | WICKET → **Caught** → catcher | The fielder grid shows the fielding XI (bowler first as "c & b"; the keeper marked WK; substitute fielders listed as "sub"). A tap commits. **Catcher not known** commits with `fielderIds: []` → "c ? b Hassan" |
| Stumped | **3** | WICKET → **Stumped** → keeper (preselected, highlighted) | The fielder grid with the designated keeper first (tagged WK), then the rest of the XI in batting order (the bowler has no "c&b" tag here), then substitutes; tapping the keeper commits. **Confirm keeper** is the same tap. Without a designated keeper the grid is the XI in batting order |
| Run out | **3** with defaults | WICKET → **Run out** → **Record run out** | The run-out panel shows defaults: *Who's out* `Striker · Non-striker` (default striker), *At which end* `Keeper's end · Bowler's end` (default: the striker's end for the striker, the bowler's end for the non-striker), *Runs completed* `0 1 2 3` (default 0), *Fielders* optional (up to 2, "Thrower / at the stumps"). Each changed default adds one tap: **typically 4–6 taps** |
| Obstructing / handled / hit twice | 3–5 | WICKET → **More dismissals** → type (→ end, for obstructing/handled) → Record | rare |
| Any, choosing a different next batter | +1 | Tap the "Next in" row → pick the batter (before the dismissal tap) | – |
| Wicket on a wide (stumped / run out) | +1 | Tap `Wide` in the Delivery row first | `call:'wide'` |

After commit:
- If the over also ended on this ball, the **Next bowler panel** follows (§2.5), for 1 more tap.
- With **Choose later**, the **Next batter panel** blocks the pad (`select_next_batter`) until a batter is picked (1 tap).
- A Law 16.6 rejection (`WICKET_AFTER_RESULT`): the sheet stays open with an inline message: "The match was already won before this wicket. Record the runs without the wicket." [Record without wicket] [Cancel]. **Record without wicket** records the same delivery with the wicket removed: the chosen Delivery call and the runs completed are kept, so a stumping off a winning wide records `wide(runs)`, a run out off a no-ball records `noBall({runsTo:'bat', runsRun})`, and a fair ball records `scoreRuns(runs, {allRun:true})`. It never turns a wide or a no-ball into a fair ball.
- Off-ball dismissals (timed out, run out backing up, obstruction without a delivery) and **Retired hurt / retired out / retired not out** are in **More → Retire or dismiss batter**, not on the ball sheet.

### 2.3 Extras flow (§17)

**EXTRAS** opens the extras sheet. It has five tabs, opens on **Wide**, and remembers the last tab for the rest of the over. **A chip tap commits immediately.** The "Custom…" panel commits with a **Record** button. Each opening starts fresh apart from that tab: "Runs off" is back on **Bat** and any Custom panel is closed, so a byes choice for one no-ball never carries over to the next. The same rule holds for every other scoring sheet (wicket, retire, change bowler, penalty, suspend, revise overs, end innings, decide tie, end match, add player): each opening shows the defaults for the state at that moment (for example, Change bowler opens on Injured, Penalty opens with an empty reason and the current batting side, Retire opens on a batter who is at the crease).

| Tab | Chips (label = resulting token text) | Intent |
|---|---|---|
| Wide | `WD` · `WD+1` · `WD+2` · `WD+3` · `WD+4` (ran four) · **Boundary** (`WD+4`, to the rope) · Custom… | `wide()`, `wide(1)`…`wide(4)`, `wide(0,{boundary:true})` |
| No ball | Row "Runs off: **Bat** · Byes · Leg byes" (segmented, default Bat), then `NB` · `+1` · `+2` · `+3` · `+4` · `+6` · Custom… (`+6` only with Bat) | `noBall({runsTo, runsRun})`; `+4`/`+6` → `noBall({boundary:4|6})` with Bat, `noBall({runsTo:'bye', boundary:4})` with byes |
| Bye | `B1` · `B2` · `B3` · `B4` (boundary) · Custom… | `bye(n)`, `bye(0,{boundary:true})` |
| Leg bye | `LB1` · `LB2` · `LB3` · `LB4` (boundary) · Custom… | `legBye(n)`, `legBye(0,{boundary:true})` |
| Other | `5 runs` · `7 runs` · **All-run 4** · **1 + 4 overthrows** · **2 + 4 overthrows** · **Short run…** · **Penalty runs…** | `scoreRuns(5)`, `scoreRuns(7)`, `scoreRuns(4,{allRun:true})`, `overthrowBoundary(1)`, `overthrowBoundary(2)`, custom panel with `shortRuns`, penalty sheet (`penalty` intent) |

**Custom… panel** (any tab): *Runs run* Stepper 0–9, *Boundary* segmented `None · 4 · 6`, *Short runs* Stepper 0–runs run (under "More"), then **Record**. The preview line shows the token that will be recorded, e.g. `NB+2B`. It must come from the domain, never be assembled by the UI. The contract has no intent → token helper (`ballToken` takes a `BallRecord`), so this line needs a small pure domain addition. Until that exists, omit the preview line; the committed chip appears in the strip anyway.

| Case | Taps |
|---|---|
| Wide (1 wd) | **2**: EXTRAS → `WD` |
| Wide, ran 1 | **2**: EXTRAS → `WD+1` |
| Wide to the boundary | **2**: EXTRAS → Boundary |
| No-ball, hit for 4 off the bat | **3**: EXTRAS → No ball → `+4` |
| No-ball + 2 byes | **4**: EXTRAS → No ball → Byes → `+2` |
| Leg bye 1 | **3**: EXTRAS → Leg bye → `LB1` |
| 1 + 4 overthrows | **3**: EXTRAS → Other → `1 + 4 overthrows` |
| Custom (e.g. NB + 3 leg byes + 1 short) | 7–9 |

Free-hit consequences are automatic: after a no-ball, the header shows `FREE HIT` and the next chip carries the free-hit bar.

### 2.4 Swap strike (§11, §19)

1 tap: **Swap** in the action row → `dispatch(swapStrike())` → the ▶ marker moves; toast "Strike swapped" with Undo. Disabled (with `accessibilityHint` "Only one batter at the crease") when a last-man-stands batter bats alone (`NOTHING_TO_SWAP`).

### 2.5 End of over → next bowler

1. The last legal ball commits. The strip plays the end-of-over motion. `pendingAction = select_next_bowler`.
2. If `settings.scoring.autoPromptBowler` is on (the default), the **Next bowler panel** replaces the pad. It shows eligible bowlers as 56-tall rows (name, figures `2-0-14-1`, overs left), with the previous-over bowler and quota-reached bowlers listed below under "Can't bowl this over" with the reason text (from `BowlerIneligibility`: "Bowled the last over", "Reached 4 overs", "Removed from the attack").
3. **1 tap** on a bowler → `dispatch({type:'select_bowler', bowlerId})`. The pad returns.
4. If the preference is off, the pad shows a single **Choose bowler for over 18** button (1 extra tap).
5. Mid-over change (injury or suspension): More → **Change bowler** → reason `Injured · Suspended` → pick the bowler. A wrong bowler at the start of an over is fixed by Undo (if it is the last action) or by editing the over's first ball (§5), not by a "correction" event (review decision L12).

### 2.6 Undo and redo (§15)

| Step | User | System |
|---|---|---|
| 1 | Taps **Undo** in the action row (always visible, 1 tap, no confirmation) | `useLiveMatchStore.undo()` → `MatchService.undo(matchId, lastSeq)` → removes the last **action group** (e.g. wicket + incoming batter together) → state replayed |
| 2 | – | Toast "Undone: 17.3 · WICKET, Ali b Hassan" [Redo]. Motion runs in reverse (the chip fades out, the score rolls back). **Redo** appears in the action row next to Undo. As built the text is "Undone: {ball label} · {domain ball label}", plus the batter and the domain dismissal text for a wicket ("Undone: 17.3 · Wicket, bowled, Ali Khan b Hassan Ali"); a group without a delivery names the action ("Undone: strike swap", "Undone: bowler choice", "Undone: match result") |
| 3 | Taps Undo repeatedly | Each tap removes one more group, unlimited, back to `innings_started` (Undo is then disabled: "Nothing to undo") |
| 4 | Taps **Redo** | `redo()` re-appends the identical group. Redo disappears when the stack is empty |
| 5 | Scores a new ball instead | The redo stack is cleared (store contract); Redo disappears |

Special cases:
- **Undo of a confirmed result** (the last group contains `match_ended`) is offered from the completed scorecard ⋯ → **Reopen match**. Standalone match: a Dialog "Reopen this match? The result will be removed until you confirm it again." Tournament match: the service returns `CONFIRMATION_REQUIRED` → the impact sheet (standings, NRR, qualification that will revert) + reason → Continue → `undo(reason)`. Audited `match_reopened`.
- Pending-action panels always carry **Undo last ball**, so a mis-tapped wicket or last ball never traps the scorer.
- The redo stack does not survive leaving the match or a restart. This is stated in the toast after a reopen: "Redo is available until you leave this match."

### 2.7 Innings end variants

| Trigger | UI |
|---|---|
| All out / overs complete / target reached | Automatic → innings break panel or confirm-result panel |
| Declaration | More → **End innings** → `Declared · No batters available` → for "No batters available", pick absentees (checkbox list; "Absent hurt" toggle per player) → Dialog "End Pakistan XI's innings at 142/7?" → `end_innings` |
| Next-batter panel with `canEndInnings` | The panel offers **End innings: no batters available** |

### 2.8 Rain: suspend, revise overs, par score (§7, §22)

1. More → **Suspend play** → reason chips `Rain · Bad light · Wet outfield · Interval · Injury · Other` + optional note → `suspend_play`. The pad is replaced by the **Play suspended panel**: "Play suspended: rain since 14.2 ov" with [Resume play] (primary), [Revise overs], [End match…].
2. **Revise overs** (from the panel or More): innings selector (current / chase), "New overs" Stepper (or "Exact balls"), "Apply to both innings" toggle (innings 1 only), revised target field (chase), bowler max overs, reason (required). For a chase, the switch **"Chase ends here: decide on par score"** (`terminal: true`) sets `target = par + 1`, with the helper "Par is the score the chasing team needed at this point (e.g. from DLS tables). Scorebook doesn't calculate DLS." (open question 5).
3. Apply → `revise_overs`. A terminal revision → `confirm_result` shows **while still paused**, e.g. "Lions won by 21 runs (par score)" → Confirm result.
4. Otherwise **Resume play** → `resume_play` → the pad returns.

### 2.9 Penalty runs (§20, Law 41)

More → **Penalty runs** → team (segmented with both short names), runs (chips `5` + Stepper), **Innings** (defaults to the placement rule, shown as "Added to Pakistan XI's current innings"; changeable among the valid innings of the current phase), reason (required) → Record. The token log shows "Penalty +5 (Pakistan XI)" as a text row, not a ball chip.

### 2.10 Tie and super over (§21)

`resolve_tie` panel: "Match tied: 168 each". Options from `pendingAction.options`: **Play a super over** (primary), **Accept the tie**, **Decide another way…** (boundary count / bowl-out / coin toss / organizer → winner picker → reason). Super over → `start_super_over` → the innings break panel with super-over eligibility applied (ineligible players listed with "Dismissed in the previous super over" / "Bowled the previous super over").

### 2.11 Advisory mandatory retirement (L6)

A warning banner appears under the batters: "Ali has reached 30. Retire now? (tournament rule)" with [Retire] [Not now]. Retire → `retire(retired_not_out)` + next batter picker. Not now hides it until the next ball. **Scoring is never blocked.**

---

## 3. Recovery flows (§23, §93)

### 3.1 Resume after a crash, battery loss or force-quit

| # | Moment | System | UI |
|---|---|---|---|
| 1 | App launch | Splash; `useAppStore.bootstrap()` → migrations → rebuild stale projections → replay live/paused matches → `findResumable({forPrompt:true})` | Native splash (≤ 1 s typical) |
| 2 | Home renders | `report.resumable` non-empty | **MATCH IN PROGRESS** blocking sheet: "Pakistan XI 142/4 · 16.4 overs · v Lions · T20" (from `MatchListItem.innings` via `formatScore` / `formatOvers`) |
| 3a | **RESUME** | `router.push('/match/[id]/score')` → `open()` → `MatchService.load` → replay → identical state | Scoring screen exactly as before; toast "Resumed at 16.4 overs. Last ball: 4 (Ali)." The last ball's chip is in the strip. Undo reaches back through every committed ball, but the redo stack is empty (session only) |
| 3b | **SAVE & EXIT** | `dismissResume(matchId)` → `resume_dismissed_at` stored | Sheet closes; Home shows the match under Continue Match; no prompt on the next launch until another ball is recorded |
| 3c | **DISCARD** (standalone matches only; tournament matches show only RESUME and SAVE & EXIT, with the note "Tournament matches can't be discarded. End or abandon it in Match settings.") | Dialog "Discard this match? 100 recorded balls will be deleted. This can't be undone." [Cancel] [Discard match] → `MatchService.discard` | Toast "Match discarded" (no undo) |
| 4 | Several resumable matches | – | The sheet lists them (most recent first), each row with its own RESUME; SAVE & EXIT applies to all listed |
| 5 | A match needs repair after an engine upgrade (`integrityIssues`) | – | The resume row shows the badge "Needs repair". RESUME opens the scoring screen in the repair state (§0) |
| 6 | Bootstrap fails | – | Root ErrorState "Scorebook couldn't open your data. Nothing has been changed." [Try again] + Technical details |

**Guarantee statement shown in Settings → About:** "Every ball is saved the moment you record it. If your phone switches off, you'll be offered to resume exactly where you left off."

### 3.2 Save failure mid-over

Tap `4` → the transaction fails → no chip, no score change → error toast [Try again] + Error haptic. Try again re-dispatches `scoreRuns(4)`. If it keeps failing: the toast's secondary text reads "If this keeps happening, open Settings → Diagnostics." The scorer can keep a paper note and add balls later.

---

## 4. Tournament flows (§65, §66)

`Home → Tournaments → Create → Details → Add Teams → Build Stages → Create Pools → Random/Manual Assignment → Review Pools → Configure Fixtures → Automatic/Manual Generation → Review Fixtures → Confirm → Dashboard → Start Matches → Live Scoring → Complete Match → Automatic Standings Update → Qualification → Next Stage → Semifinal → Final → Tournament Complete → Statistics/Export`

### 4.1 Create tournament: wizard (§25)

| # | Screen | User | System | Edge |
|---|---|---|---|---|
| 1 | Tournaments | **+ New tournament** | `useTournamentWizardStore.reset()` → push `tournament/new` | Drafts list offers **Continue** → `resume(id)` at the saved step |
| 2 | Details | Name (required), season, organizer, dates, venues (multi-pick + add), description | `saveStep()` → `TournamentService.create` on first save | Name empty → inline error |
| 3 | Teams | Multi-select from the library (search; "Select all shown"); **+ New team**; optional **Seeds** mode (numeric seed per team, 1 = strongest) | `addTeams([{teamId, seed}])` on save | Fewer than 2 teams → Next disabled "Add at least 2 teams". The count is shown: "12 teams" |
| 4 | Format | Template list first (only templates that fit the team count: `templateFitsTeamCount`; others collapsed under "Other templates"). Or a structure: League · Groups · Knockout · Groups + knockout · Custom. The stage list below is editable (add / rename / reorder stages; "Decides the champion" marker on one stage, defaulting to the last) | `instantiateTemplate` / defaults → draft stages, pools, slots | – |
| 5 | Rules | Points Win/Tie/NR/Loss Steppers (2/1/1/0 default), NRR mode (ICC · Actual overs) with a one-line explanation each, tie-breaker order (reorderable list with ↑ ↓ buttons; add/remove criteria), default match format | `saveStructure(...)` with rules | – |
| 6 | Pools | See flow 4.2 | – | – |
| 7 | Fixtures | See flow 4.3 | – | – |
| 8 | Review | Sections: Details, Teams (12), Format ("Group stage: 3 pools · Knockouts: SF, Final"), Rules ("Points 2/1/1/0 · Points → NRR → Head-to-head"), Pools (members), Fixtures ("18 group matches, 3 knockout matches between qualifiers"). Each has **Edit** | – | – |
| 9 | Review | **Confirm tournament** | `commit()` → status `fixtures_generated` → `router.replace('/tournament/[id]')` | – |

### 4.2 Pool randomisation with undo (§30–§32)

On `tournament/new/pools` (and later on `tournament/[id]/pools`, with impact):

| # | User | System | UI |
|---|---|---|---|
| 1 | Sets **Number of pools** (Stepper) | `distributePoolSizes(12, 3)` preview | "3 pools: 4 · 4 · 4". For 10 teams in 3 pools: "4 · 3 · 3" + warning banner (§32) "Teams in different pools may play different numbers of matches. Choose how qualification compares them in Rules." with the link [Compare fairly…] (opens the uneven-pool normalisation choice: Raw · Per-match average · Drop extra results) |
| 2 | Chooses method: **Random** · **Seeded** · **Manual** (segmented) | – | Random shows an optional **Seed** field ("Leave empty for a new random draw. Enter a seed, e.g. 847291, to reproduce a draw.") |
| 3 | Taps **Draw pools** | If pools already have members: Dialog **"Current pool arrangement will be replaced."** (§31) [Cancel] [Replace] | – |
| 4 | Replace | `previewPoolAssignment(stageId, {kind:'random', seed})` → the previous `PoolAssignment` is kept in the wizard draft as `previousAssignment` | Pools render as columns (tablet) or stacked sections (phone): "Pool A: Tigers, Lions, Eagles, Hawks". The caption reads **"Random draw · seed 847291"** |
| 5 | – | Toast "Pools drawn (seed 847291)" **[Undo]** (6 s) | A persistent tertiary link **Restore previous arrangement** stays under the pools until the next change or leaving the step |
| 6 | Undo / Restore | `update({poolAssignment: previousAssignment})` | Previous pools shown; toast "Previous pools restored" |
| 7 | Manual adjustments | Each member row has ⋯ → **Move to pool…** / **Swap with…** | Before fixtures exist these apply instantly (`allowed`). A manual change sets `PoolAssignment.seed` to `null`, the caption becomes "Draw adjusted by hand" (or "Manual assignment"), and the **Restore previous arrangement** link goes away. Restore and Undo bring back the caption of the restored arrangement |

Changing **Number of pools** while two or more pools already hold teams shows the same Dialog **"Current pool arrangement will be replaced."** first. Replace changes the count, empties the pools (with one pool, every team goes into it), and offers Undo and Restore, which bring back the previous pool count and members. The uneven-size warning (§32) follows the size preview from step 1, so it appears before any draw.
| 8 | Next | `saveStep()` → `saveStructure({… poolEntries})` → `pools_configured` | – |

**After fixtures exist** (`tournament/[id]/pools` → **Re-draw pools**): steps 3–4 become `previewChange({kind:'pools_replace', stageId, pools, seed})` → the WHAT WILL CHANGE sheet ("12 unplayed fixtures will be regenerated") → Continue → `applyChange`. **Undo** here means a second `pools_replace` with the previous members, captured before applying and offered as the toast action "Undo". It goes through the same impact preview, because the fixtures are regenerated again. Once any match of the stage has started, re-draw is `confirm` with a reason, and the policy table forbids it for completed pools.

### 4.3 Fixtures: generate → preview → edit → confirm (§35–§37)

1. **Format per stage**: `Single round robin · Double round robin · Custom encounters (n)` (and per-pool legs for uneven pools: "Pool C has 3 teams: play each other twice?").
2. **Generate** → `generateFixtures(stageId, {seed})` → `FixturePlan`. The preview lists fixtures by round: "Round 1 · Match 1 · Tigers v Lions".
3. Tapping a fixture opens the **Fixture editor sheet** (date, time, venue, swap sides, format/overs, notes). **Schedule…** fills dates sequentially from the start date (`scheduleSequential`), avoiding double-booking a team on a day.
4. Validation from `validateFixtureDrafts` is shown inline: errors (red, block Confirm), warnings (amber, e.g. "Hawks play twice on Sat 12 Sep").
5. Knockout stages between slots show "Winner SF1 v Winner SF2" as fixtures that already exist.
6. **Regenerate** asks "Regenerate fixtures? Your edits to this preview will be lost." Nothing is persisted until **Confirm fixtures** (`confirmFixtures`).

### 4.4 Start a tournament match: §66 match-to-tournament

| # | Screen | User | System |
|---|---|---|---|
| 1 | Dashboard | Taps **Start** on "Next match: Match 10 · Lions v Tigers" (or opens the fixture) | – |
| 2 | Fixture detail | Taps **Start match** | `useMatchSetupStore.startFromFixture(tournamentId, fixtureId)` → push `match/new?tournamentId&fixtureId`, starting at **Players** (teams locked; format/rules from fixture → stage → tournament, editable per the edit policy) |
| 3 | Players → Toss → Openers | Same as §1 steps 4–7 | Start match → the match is created linked to the fixture (the fixture mirror becomes `live`, and the sides **freeze** as `Fixture.matchSides`) |
| 4 | Live scoring | Identical engine and screens (the top bar adds the tournament short name: "City Cup · Match 10") | – |
| 5 | Confirm result | Taps Confirm result | `match_ended` → one transaction updates the fixture (`completed`), stage/tournament status, revision, champion projection and audit `result_recorded` |
| 6 | Scorecard | A tournament block appears under the result: **"Standings updated"**: Pool A top 4 with position changes (▲1 / ▼1 as text + arrow glyph) and qualification lines, e.g. "Tigers have mathematically qualified for the Semifinal." [View standings] | `useTournamentStore.refresh()` → `evaluate` |
| 7 | Dashboard | Progress 25/48; next match updates; slots resolve ("A1 · Tigers") | – |

Knockout specifics: a fixture whose slots are unresolved shows **Start match** disabled with "Waiting for Pool A winner". A provisional slot allows start only after a Dialog: "Pool A isn't finished. Tigers are provisionally A1. Starting now fixes Tigers in this match even if the table changes." [Cancel] [Start anyway].

### 4.5 Qualification and next stage (§44–§47, §98)

1. After the last pool match, the Standings screen shows every row with its label ("Qualified", "Eliminated") and certainty ("Mathematical"). The explanation list under the table reads, for example:
   > Top 2 from each pool qualify for the Semifinal. Tie-breakers: Points → NRR → Head-to-head.
   > Tigers: 1st, 8 pts. Qualified for the Semifinal as A1.
   > Lions: 2nd, 6 pts. Ahead of Eagles on net run rate (+0.512 vs +0.231). Qualified as A2.
2. An unresolved tie on a slot boundary (`unresolvedTies`) gives a warning banner on the dashboard and standings: "Lions and Eagles can't be separated for 2nd in Pool A. [Resolve tie]" → override sheet (`tie_resolution`: organizer decision order, or **Draw lots** with a seed) → reason → the impact sheet → apply.
3. The bracket fills: SF1 "Tigers (A1) v Hawks (B2)". Knockout fixtures get Start enabled.
4. **Manual override** (§47): Qualification → team ⋯ → Qualify / Eliminate / Reassign to slot… → reason → WHAT WILL CHANGE → Continue. The row then shows the **Manual Override** badge, and the explanation adds "Qualified by the organizer: <reason>". Revoke is on the same row.

### 4.6 Final and tournament complete

1. Confirming the final's result (in the stage with `decidesChampion`) → the dashboard's first section becomes **Champion: Tigers**, "Won the final by 5 wickets", and the banner "All matches are complete. [Complete tournament]".
2. **Complete tournament** → `setStatus('completed')` → dashboard in completed mode (IA §6).
3. **Statistics** and **Export**: Tournament settings → **Export PDF** (standings, results, bracket, records) → share; **Back up this tournament** → JSON → share.

### 4.7 Team move / swap / replace after fixtures (§33, §34)

| Action | Entry | Inputs | Change |
|---|---|---|---|
| Move | Pools → member ⋯ → **Move to pool…** | Target pool | `pool_move` with `removeFixtureIds` + `addFixtures` pre-filled by `fixturesForPoolMove`. The sheet lists exactly which fixtures are removed and created |
| Swap | Pools → member ⋯ → **Swap with…** | Member of another pool | `pool_swap` |
| Replace | Teams → team ⋯ → **Replace with…** | New team (library), seed, and **What happens to Team X's results?** `Transfer to replacement · Keep for opponents · Remove (expunge)`, each with a one-line explanation | `team_replace` |
| Withdraw | Teams → team ⋯ → **Withdraw** | Remaining fixtures `Walkovers to opponents · Cancel`, "Also remove played results" toggle | `team_withdraw` |

Each goes through the WHAT WILL CHANGE sheet (4.9) and is audited.

### 4.8 What-if (§48)

What if → the list of unplayed fixtures of the current stage → tap a fixture → the **Hypothetical result sheet**: `Side A win · Side B win · Tie (winner of tie-break optional) · No result · Abandoned · Walkover A/B`, optional margin ("Score" expander with runs/balls for NRR) → Done. The summary above shows: "2 hypothetical results". **See outcome** → `whatIf(hypotheticals)` → before/after tables with changed rows marked "▲2 · 3rd → 1st" and the narrative lines. A persistent banner reads "Simulation only. Nothing in the tournament changes." There is no Apply button (the what-if screen never calls `applyChange`). **Clear** resets it.

### 4.9 Impact preview (WHAT WILL CHANGE): generic flow (§34, §99)

| # | User | System | UI |
|---|---|---|---|
| 1 | Initiates a change (move, replace, rules, fixture teams, result correction, override, stage edit) | `previewChange(change)` → `ChangePreview {impact, version}` | Sheet title **What will change**; `impact.headline` in `headline` style |
| 2 | Reads | – | Sections, shown only when non-empty: **Fixtures** (created / removed / teams changed, with labels; "has match data" flagged with a warning icon + text), **Standings** (team: `3rd → 1st · 6 → 8 pts · NRR +0.21 → +0.54`), **Qualification** (`In contention → Qualified (Semifinal)`), **Slots** (`A1: Tigers → Lions`; played fixtures listed as "Played: SF1 stays Tigers v Hawks (results stand)"), **Net run rate changes** (yes/no), **Completed matches affected: 3** |
| 3 | – | `impact.blocked` | Only [Close] and the reason text ("This team has played matches. Withdraw it instead of removing it.") |
| 4 | Types a reason (when required) | – | Multiline field; Continue is disabled until filled |
| 5 | **Continue** | `applyChange(change, reason, preview)` → version check → the same `ChangePlan` is persisted, then audited | Success toast "Changes applied" (+ "View audit log") |
| 6 | Version moved since the preview | `CONFLICT` | Dialog "The tournament changed while you were reviewing. Review the changes again." [Review again] → back to step 1 |
| 7 | **Cancel** | Nothing written | Sheet closes |

Severity mapping: `none`/`info` → the Continue button is primary; `warning` → a warning line at the top; `destructive` → Continue becomes `destructiveConfirm` with the label "Apply changes".

---

## 5. Edit a past ball (§16)

| # | Screen | User | System |
|---|---|---|---|
| 1 | Scorecard → **Ball by ball** (or live More → Ball by ball) | Taps the chip at 17.3 (`4`) | push `edit/[seq]` |
| 2 | Edit ball 17.3 | Sees "Recorded: **FOUR** · Hassan to Ali · 17.3". Chooses a replacement with the same pad (`0 1 2 3 4 6 EXTRAS WICKET`); EXTRAS and WICKET open the same sheets as live scoring, but **they don't commit**: they fill the replacement. Other actions: **Delete this ball**, **Insert a ball before**, **Change bowler for this over** | Builds `HistoryEditOp[]` (`replace` / `delete` / `insert_before`). A wicket replacement adds the incoming batter picker in the same op |
| 3 | – | Taps **Preview** | `previewHistoryEdit(matchId, ops)` → `HistoryEditPreview` |
| 4 | Preview | Reads **What will change**: score `168/7 → 165/7`, innings result, batter changes ("Ali 42 → 38, 4s 3 → 2"), bowler changes ("Hassan 3.4-0-28-2 → 3.4-0-24-2", or wide: "Hassan bowls one extra ball in over 18"), partnership, result ("Result changes: Lions won by 5 wickets → Lions won by 2 wickets"), and for a tournament match the tournament impact block (standings, NRR, qualification) | – |
| 5 | Validation failure | `ok:false` from the domain | Inline explanation, e.g. "Removing this wicket leaves Shoaib Malik with no place at the crease. Also remove his arrival?" [Remove both] (adds the op) |
| 6 | Reason | Required for completed and tournament matches (`requiresReason`) | Field under the preview |
| 7 | **Apply change** | `applyHistoryEdit(matchId, ops, reason, baseFingerprint)` → one transaction → audit `match_history_edited` / `result_corrected` | Back to the ball log with the edited chip ringed for 2 s (ring = 2 `focusRing`); toast "Ball 17.3 changed" |
| 8 | Log changed since the preview | `CONFLICT` | Dialog "This match changed after you opened the preview. Review the edit again." [Review again] |

Live-match edits (`history = warn`) skip the reason but still show the preview and are audited.

---

## 6. Other flows (brief)

| Flow | Steps |
|---|---|
| **Delete a match** (History) | Row ⋯ → Delete → Dialog "Delete Lions v Tigers? Its scorecard and 240 balls will be deleted." → `remove`. Tournament-linked completed matches: ⋯ shows "Part of City Cup: open the fixture to change it" instead |
| **Delete a tournament** | Tournament settings → Delete → `previewDelete` → Dialog: counts ("24 matches, 18 completed, 4,210 balls"), **Back up first** button, typed name field, checkbox "Also delete 18 completed matches" (required when > 0) → `delete(id, {typedName, deleteCompletedMatches})` |
| **Import backup** | Settings → Backup & import → Import → document picker → `previewImport` → preview: validity (issues listed by severity, with messages from `BackupIssue.message`), counts, "Imported before on 12 Sep" (`previouslyImportedAt`), conflicts per aggregate ("Tournament City Cup exists here: 3 matches only on this device") → policy `Skip existing · Import as a copy · Replace existing` (Replace shows the local-only counts in danger text) → Import → `applyImport` → report "Imported 1 tournament, 24 matches. Skipped 2 teams." |
| **Export full backup** | Settings → Backup & import → **Export all data** → `exportBackup({kind:'full'})` → share sheet (file name `scorebook-backup-2026-09-30.json`) |
| **Change theme** | Settings → Appearance → Light · Dark · System → applied instantly, no restart |
| **Add a late player during a match** | Player picker (next batter / bowler / fielder) → **Add player** → name (+ "Substitute fielder" toggle) → `addSquadPlayer` → selected |
| **Postpone / reschedule a fixture** | Fixture → **Postpone** (reason) → status Postponed → later **Reschedule** (new date) |
| **Walkover / award** | Fixture → ⋯ → Walkover (winner, reason) / Award (winner optional, reason) → impact sheet → apply |
| **Abandon / no result** | Live More → Match settings → End match → `Abandoned · No result · Awarded` → reason → (tournament: impact) → confirm |
