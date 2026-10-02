# Scorebook — User Stories

§102 product item 3 ("user stories"), §4 phase 2.

Stories are grouped by epic. Each story has an ID (`US-<epic>-NN`), a persona ([PERSONAS.md](PERSONAS.md): P1 club scorer, P2 school teacher, P3 university organizer, P4 weekend group, P5 league statistician), a priority, and trace links to SPEC sections (§N) and requirements ([REQUIREMENTS.md](REQUIREMENTS.md)).

The important stories have Given/When/Then acceptance criteria. The criteria use contract vocabulary (type and code names from `src/domain/types`) so they can be turned directly into tests.

**Priority:** **MVP** (V1 release gate) · **V1** (in V1 scope, not a release gate) · **Later** (§96).

| Epic | Prefix | Spec |
|---|---|---|
| Home & recovery | US-H | §5, §23, §79 |
| Match setup | US-M | §6–§8, §64 |
| Live scoring | US-S | §9–§13, §17, §19, §20 |
| Wickets & batters | US-W | §18, §19 |
| Match events (rain, penalties, super over, ending) | US-E | §7, §21, §22, §63 |
| Corrections | US-C | §15, §16 |
| Scorecard, history & export | US-SC | §64, §81, §83 |
| Tournament setup | US-T | §24–§32, §56 |
| Pools & team changes | US-P | §33, §34 |
| Fixtures | US-F | §35–§39, §66 |
| Standings, points, NRR, tie-breakers | US-ST | §40–§43, §50 |
| Qualification, knockouts & overrides | US-Q | §44–§47, §51, §98 |
| Dashboard, statistics, what-if, audit | US-D | §48, §49, §52, §53 |
| Backup & data | US-B | §84, §85, §93 |
| Settings & accessibility | US-A | §70, §76–§78, §86 |

---

## Epic H — Home & recovery

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-H-01 | As a scorer, I want Home to offer + NEW MATCH, TOURNAMENTS, Continue Match and Recent Matches, so that I reach any task in one tap. | P1, P4 | MVP | §5, §79 |
| US-H-02 | As a scorer whose phone died, I want the app to offer the unfinished match on the next launch, so that I can carry on from the last ball. | P1, P2 | MVP | §23 · FR-R-01 |
| US-H-03 | As a teacher pausing a match until next week, I want SAVE & EXIT to stop the startup prompt without ending the match, so that it doesn't nag me every launch. | P2 | MVP | §23 · FR-R-02 |
| US-H-04 | As a scorer, I want DISCARD to delete an unfinished standalone match after I confirm, so that a test match doesn't clutter my history. | P4 | MVP | §23 · FR-R-03 |
| US-H-05 | As a first-time user, I want purposeful empty states, so that I know what to do next. | P4 | MVP | §87 |

**US-H-02 acceptance criteria**
* **Given** a live match at 142/4 after 16.4 overs, **when** the app is force-stopped or the battery dies and the app is relaunched, **then** Home shows `MATCH IN PROGRESS / Pakistan XI 142/4 16.4 overs / [RESUME] [SAVE & EXIT] [DISCARD]`.
* **Given** the prompt, **when** I tap RESUME, **then** the scoring screen opens with the same striker, non-striker, bowler, current-over strip, free-hit flag and pending prompt as before the crash (state = `replayMatch(setup, events)`).
* **Given** the crash happened while a ball was being saved, **when** I resume, **then** that ball either appears completely (score, cards, strike all updated) or not at all. It is never partly applied.
* **Given** a match whose status is `paused` (rain), **when** the app relaunches, **then** it is also offered, and resuming shows the `resume_play` prompt.

**US-H-03 acceptance criteria**
* **Given** the startup prompt, **when** I tap SAVE & EXIT, **then** the match stays `live`, remains listed under Continue Match, and is not offered by the startup prompt on later launches (`resumeDismissedAt` set).
* **Given** a SAVE & EXIT match, **when** I record the next event in it, **then** the dismissal is cleared and a later crash offers it again.

**US-H-04 acceptance criteria**
* **Given** an unfinished standalone match, **when** I tap DISCARD and confirm, **then** the match, its squads and events are deleted.
* **Given** an unfinished tournament match, **then** DISCARD is not offered. I'm told to end the match (abandon, no result, award) from the match's Manage screen instead.

---

## Epic M — Match setup

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-M-01 | As a scorer, I want to create a match with a title, Team A, Team B, venue, date and time, so that the scorecard is complete. Venue, date and time are optional. | P1, P4 | MVP | §6 · FR-M-01 |
| US-M-02 | As a scorer, I want to pick a format preset (T5–T50) or Custom, and change any value afterwards, so that presets save time without limiting me. | P1, P2 | MVP | §8 · FR-M-02 |
| US-M-03 | As an organizer, I want any number of overs (quick picks 1, 2, 5, 6, 10, 20, 25, 30, 40, 50 or a typed value such as 17), so that I'm not forced into T10 or T20. | P2, P4 | MVP | §7 · FR-M-03 |
| US-M-04 | As a teacher, I want to set players per side (e.g. 8) and a different size for one team (e.g. 7), so that uneven sides are scored correctly. | P2, P4 | MVP | §6 · FR-M-04 |
| US-M-05 | As a scorer, I want to set wide and no-ball penalties, whether they count as a ball, free hit on or off, powerplays, the bowler quota and the consecutive-overs rule, so that local rules are respected. | P1, P4 | MVP | §6, §17, §20 · FR-M-05 |
| US-M-06 | As a scorer, I want to choose squads from the team library or create players quickly, and mark substitute fielders, so that fielding credits are right. | P1 | MVP | §6, §27 · FR-M-06 |
| US-M-07 | As a scorer, I want to record the toss or skip it, so that gully games aren't blocked. | P4 | MVP | §6 · FR-M-07 |
| US-M-08 | As a scorer, I want to choose the opening batters and the opening bowler, and start scoring from the same screen, so that setup ends at the first ball. | P1 | MVP | §64 · FR-M-08 |
| US-M-09 | As a teacher, I want an optional "retire at N runs" rule, so that more children get to bat. | P2 | MVP | FR-M-09 |
| US-M-10 | As an organizer, I want to configure the super over (overs, wickets, what happens if tied again, maximum rounds, repeat-player restriction), so that ties are resolved our way. | P1, P3 | MVP | §21 · FR-M-10 |
| US-M-11 | As a scorer, I want to save my own format presets, so that my club's 30-over rules are one tap away. | P1 | V1 | §8 · FR-M-11 |
| US-M-12 | As a user, I want invalid rule combinations flagged before the match is created (e.g. the bowler quota makes the innings impossible), so that I don't discover it at over 18. | P2, P4 | MVP | FR-M-12 |

**US-M-03 acceptance criteria**
* **Given** match setup, **when** I type 17 overs, **then** the rules are `rulesForOvers(17)`: the uniform bowler quota is ⌈17 ÷ 5⌉ = 4, and powerplays are scaled and clamped to 17 overs.
* **Given** 0 or a non-integer, **then** creation is blocked with `OVERS_INVALID` and a plain message.

**US-M-04 acceptance criteria**
* **Given** `playersPerSide: 8` and `teamBPlayers: 7`, **when** team B bats, **then** its innings is all out at 6 wickets. With `lastManStands`, the 7th batter bats alone at 6 wickets and the innings is all out at 7.
* **Given** team B wins a chase 3 wickets down, **then** the result reads "won by 3 wickets" (7 − 1 − 3), using team B's own size.

**US-M-05 acceptance criteria**
* **Given** `wide.countsAsBall: true`, **when** a wide is bowled, **then** it counts as one of the over's balls but is never a ball faced by the striker.
* **Given** `noBall.freeHit: false`, **when** a no-ball is bowled, **then** the next ball is not a free hit.

**US-M-08 acceptance criteria**
* **Given** a completed setup, **when** I confirm the openers, **then** the match, its squads and the `innings_started` event are written in one transaction, and the scoring screen opens ready for ball 0.1.
* **Given** a toss won by Team A with the decision "bat", **when** I try to start with Team B batting, **then** I'm blocked with `TOSS_MISMATCH` ("Team A won the toss and chose to bat.").
* **Given** a substitute fielder, **then** they don't appear in the opener or opening-bowler pickers (`SUBSTITUTE_NOT_ALLOWED`).

**US-M-12 acceptance criteria**
* **Given** a 3-player fielding side, 20 overs and a uniform quota of 4, **then** setup shows the warning `BOWLER_QUOTA_TOO_LOW` ("These bowlers can bowl at most 12 of 20 overs.") and lets me change the quota or add players.

---

## Epic S — Live scoring

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-S-01 | As a scorer, I want `0 1 2 3 4 6` buttons that record a ball in one tap, so that I keep up with play. | P1, P4 | MVP | §2, §9 · FR-S-01 |
| US-S-02 | As a scorer, I want the header to show the score (`142/4`), overs (`16.4`), CRR, and during a chase the target, RRR, runs required and balls remaining, with the score most prominent. | P1 | MVP | §10, §73 · FR-S-02 |
| US-S-03 | As a scorer, I want the striker clearly marked (with an icon, not just an asterisk), with runs and balls for both batters. | P1 | MVP | §11 · FR-S-03 |
| US-S-04 | As a scorer, I want the bowler's line (`Hassan 3.4-0-28-2 ECO 7.00`), so that I can check figures as I go. | P1 | MVP | §12 · FR-S-04 |
| US-S-05 | As a scorer, I want the current over as a compact strip (`1 4 0 W WD 2`) whose items can be told apart without relying on colour. | P1, P2 | MVP | §13, §78 · FR-S-05 |
| US-S-06 | As a scorer, I want an extras sheet covering WD, WD+n, wide to the boundary, NB (+ bat runs, +4, +6, + byes, + leg-byes), byes, leg-byes and custom values, so that every extra is recorded exactly. | P1 | MVP | §17 · FR-S-06 |
| US-S-07 | As a club scorer, I want to record 1 + 4 overthrows, an all-run four, and short runs, so that runs, strike and "4s" are correct. | P1 | MVP | §17 · FR-S-07 |
| US-S-08 | As a scorer, I want strike to rotate automatically on odd runs run and at the end of the over, and a Swap Strike button for corrections. | P1, P4 | MVP | §19 · FR-S-08 |
| US-S-09 | As a scorer, I want to be asked for the next bowler at the end of each over, with ineligible bowlers shown and the reason given. | P1 | MVP | §12 · FR-S-09 |
| US-S-10 | As a scorer, I want free hits shown on the pad and in the strip, and impossible dismissals hidden on a free hit. | P1 | MVP | §20 · FR-S-10 |
| US-S-11 | As a scorer, I want the active powerplay shown, so that I can tell the umpires if asked. | P1 | V1 | §20 · FR-S-11 |
| US-S-12 | As a scorer, I want a mid-over bowler change for injury or suspension, so that the over is credited correctly. | P1 | MVP | FR-S-12 |
| US-S-13 | As a weekend organizer, I want to add a late-arriving player to either squad mid-innings, so that they can bat or bowl. | P4 | MVP | FR-S-13 |
| US-S-14 | As a scorer, I want optional haptic and sound feedback (light for runs, medium for boundaries, stronger for wickets), so that I can confirm taps without looking. | P1 | V1 | §76, §77 |

**US-S-01 acceptance criteria**
* **Given** `canRecordDelivery = true`, **when** I tap `2`, **then** exactly one `delivery {call: 'fair', runsTo: 'bat', runsRun: 2, boundary: 0}` is appended, the score rises by 2, the batters keep their ends (even runs), and the header updates within the NFR-P-01 budget.
* **Given** I tap `4`, **then** the delivery is `{runsRun: 0, boundary: 4}`: 4 to the batter, counted as a "4", no change of ends.
* **Given** `pendingAction` is not null (e.g. `select_next_bowler`), **then** the pad is disabled and the prompt is shown. There's no way to record a ball without resolving it.
* **Given** I tap twice quickly, **then** the second ball is recorded only after the first has been saved, so the order is kept and nothing is lost.

**US-S-06 acceptance criteria**
* **Given** wide penalty 1, **when** I record "wide, ran 1", **then** extras show `wd 2`, the bowler is charged 2, the striker's balls faced do not change, and the ball is re-bowled (`countsAsBall: false`).
* **Given** a wide that goes to the boundary, **then** 5 wides are recorded (1 + 4) and the token is `WD+4`.
* **Given** NB + 2 byes, **then** extras show `nb 1, b 2`, the bowler is charged 1, the batter is credited with 1 ball faced and 0 runs, and the batters don't change ends because 2 runs is even (token `NB+2B`).
* **Given** NB hit for six, **then** the batter gets 6 (and a six), the bowler is charged 7, and the next ball is a free hit.
* **Given** a leg-bye 6, **then** it's rejected with `SIX_NOT_OFF_BAT`.

**US-S-07 acceptance criteria**
* **Given** the batters ran 1 and the throw went for 4 overthrows (`overthrowBoundary(1)`), **then** the batter gets 5, the batters change ends (1 crossing), and the batter's 4s column does not increase.
* **Given** "ran 2, one short", **then** 1 run is scored, the batters stay at their original ends, and the token is `1s`.
* **Given** "ran 3, one short", **then** 2 runs are scored and the batters change ends.

**US-S-08 acceptance criteria**
* **Given** 1 run off the last legal ball of an over, **then** the batters cross (odd run) and then change ends for the new over, so the same batter faces the next ball.
* **Given** Swap Strike between deliveries, **then** a `strike_swapped` event is recorded and can be undone like any action.
* **Given** a last-man-stands lone batter, **then** odd runs and over ends never move strike.

**US-S-09 acceptance criteria**
* **Given** the over has just ended, **then** `select_next_bowler` lists eligible bowlers and shows ineligible ones with reasons: `bowled_previous_over`, `quota_reached`, `removed_from_attack`, `bowled_previous_super_over`.
* **Given** a bowler starting their last quota over, **then** the warning `BOWLER_QUOTA_LAST_OVER` is shown but not blocking.
* **Given** `bowlerQuotaMode: 'icc_one_fifth'` and 17 overs, **then** each bowler may bowl 3 overs and only two bowlers may bowl a 4th.

**US-S-12 acceptance criteria**
* **Given** a bowler injured after 3 balls, **when** I select a replacement with reason `injury`, **then** the replacement bowls the remaining balls, both bowlers appear in that over's `bowlerIds`, neither gets a maiden for it, and neither may bowl the next over.
* **Given** reason `suspended`, **then** the removed bowler is listed as `removed_from_attack` for the rest of the innings.
* **Given** 0 balls bowled in the over, **when** I choose `injury`, **then** it's rejected with `BOWLER_CHANGE_REASON_INVALID`. At the start of an over, re-selecting the bowler simply corrects the choice.

---

## Epic W — Wickets & batters

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-W-01 | As a scorer, I want a wicket sheet with Bowled, Caught, LBW, Run Out, Stumped, Hit Wicket, Hit Ball Twice, Obstructing, Handled, Retired Hurt, Retired Not Out, Retired Out and Timed Out, showing only dismissals that are possible on this delivery. | P1 | MVP | §18 · FR-W-01 |
| US-W-02 | As a scorer, I want to record bowled or caught, the fielder and the next batter in ≤ 3 taps after WICKET. | P1 | MVP | §18 · FR-W-02 |
| US-W-03 | As a scorer, I want run outs to ask which batter is out, at which end, and how many runs were completed, so that the right batter is out and strike is correct. | P1 | MVP | FR-W-03 |
| US-W-04 | As a club scorer, I want to leave the catcher unknown ("c ? b Hassan") or credit a substitute fielder ("c sub (Ali) b Hassan"). | P1, P4 | MVP | FR-W-04 |
| US-W-05 | As a scorer, I want a retired-hurt batter to be able to come back later in the innings. | P1, P2 | MVP | FR-W-05 |
| US-W-06 | As a weekend organizer, I want last man stands, so that the final batter can bat alone. | P4 | MVP | FR-W-06 |
| US-W-07 | As a scorer, I want to end an innings when no more batters are available and name the absent players, so that the card reads "absent hurt" rather than "did not bat". | P1, P2 | MVP | FR-W-07 |
| US-W-08 | As a teacher, I want a banner when a batter reaches the retirement score, with a one-tap Retire, that never blocks scoring. | P2 | MVP | FR-W-08 |
| US-W-09 | As a scorer, I want to record a non-striker run out while backing up, and timed out, without counting a ball. | P1 | V1 | FR-W-09 |

**US-W-01 acceptance criteria**
* **Given** a wide, **then** the sheet offers only Stumped, Hit Wicket, Run Out, Obstructing and Handled (`allowedDismissals`).
* **Given** a no-ball, **then** it offers only Run Out, Hit Ball Twice, Obstructing and Handled.
* **Given** a free hit, **then** Bowled, Caught, LBW, Stumped and Hit Wicket are hidden, whatever the call.

**US-W-02 acceptance criteria**
* **Given** the striker is caught by Rizwan off Hassan in mid-over, **when** I tap WICKET → Caught → Rizwan → next batter Usman, **then** a `delivery` with the wicket and a `batter_in` are appended under one `actionId`, the card shows `c Rizwan b Hassan`, Hassan's wickets rise by 1, and Usman is on strike (Law 18.11).
* **Given** the catch is off the last ball of the over, **then** the new batter goes to the non-striker's end and the not-out batter faces the next over.
* **Given** I skip the next batter, **then** `select_next_batter` is pending and the pad is disabled until I choose.

**US-W-03 acceptance criteria**
* **Given** the batters complete 1 run and the non-striker is run out going for the 2nd at the striker's end, **then** 1 run counts, the dismissed batter's position becomes the vacancy, the not-out batter is at the other end, and the bowler gets no wicket.
* **Given** the chase needs 1 and the runs completed before the wicket already reach the target, **then** the wicket is rejected with `WICKET_AFTER_RESULT` ("The match was won before this wicket.") and I'm offered to record the runs without it.

**US-W-05 acceptance criteria**
* **Given** Ali retired hurt on 23, **when** a vacancy opens later, **then** the incoming-batter list shows yet-to-bat players first and Ali after them. Choosing Ali continues his innings from 23, and the card marks `returnedFromRetirement`.
* **Given** Ali retired hurt, **then** it's not a wicket, and it's not in the fall of wickets. The partnership ends with `retirement`.

**US-W-06 acceptance criteria**
* **Given** 11-a-side with `lastManStands`, **when** the 10th wicket falls, **then** the survivor continues alone (`nonStrikerId` null), keeps strike whatever the runs, and the innings is all out when the 11th wicket falls.

**US-W-07 acceptance criteria**
* **Given** a vacancy and no eligible batter, **then** `select_next_batter` has `canEndInnings: true`. Ending records `innings_ended {batters_unavailable, absentees}`, and the innings counts as all out for NRR and the result.
* **Given** I name a player who already batted as absent, **then** it's rejected with `INVALID_ABSENTEE`.

**US-W-08 acceptance criteria**
* **Given** `mandatoryRetirement {atRuns: 20, timing: 'end_of_over'}`, **when** a batter reaches 21 mid-over, **then** the banner appears at the end of the over, not before.
* **Given** the banner, **when** the scorer keeps scoring, **then** balls are accepted (`canRecordDelivery` unaffected).
* **Given** no yet-to-bat batter remains, **then** no banner is raised. A retired-not-out batter may return only then, and only if `mayReturn`.

---

## Epic E — Match events

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-E-01 | As a scorer, I want to suspend play (rain, bad light, wet outfield, interval, injury) and resume it, so that the match shows as Paused. | P1, P3 | MVP | §22, §63 · FR-E-01 |
| US-E-02 | As an organizer, I want to reduce the overs of the current or a future innings (20 → 12), optionally for both innings at once, so that a rain delay is handled. | P1, P3 | MVP | §7 · FR-E-02 |
| US-E-03 | As an organizer, I want to set a revised target for a reduced chase (typed from a DLS or VJD sheet, or suggested by average run rate), so that the chase is fair. | P1, P3 | MVP | §41 · FR-E-03 |
| US-E-04 | As an organizer, I want to end a rain-terminated chase on a par score while play is suspended, so that the match can be decided without a fake resume. | P3, P5 | MVP | FR-E-04 |
| US-E-05 | As a scorer, I want to award 5 penalty runs to either side and choose the innings they go to, so that Law 41 penalties are recorded. | P1 | MVP | FR-E-05 |
| US-E-06 | As a scorer, I want to be asked to confirm the result when the engine detects it, so that a mis-tapped last ball can be undone before standings change. | P1, P3 | MVP | §66 · FR-E-06 |
| US-E-07 | As a scorer, when the scores are level, I want to choose between a super over, accepting the tie, or deciding it another way (bowl-out, coin toss, organizer). | P1, P3 | MVP | §21 · FR-E-07 |
| US-E-08 | As an organizer, I want to end a match as abandoned, no result, walkover or awarded (with a reason), so that every §22 outcome can be recorded. | P3, P5 | MVP | §22 · FR-E-08 |
| US-E-09 | As a scorer, I want the batting side to be able to declare. | P1 | V1 | FR-E-09 |

**US-E-02 acceptance criteria**
* **Given** innings 0 of a 20-over match suspended at 8.0 overs, **when** I revise to 12 overs with scope "both innings", **then** two `overs_revised` events are recorded under one action: the current innings goes to 72 balls, and innings 1 is planned at 72 balls. Powerplays are clamped to 12 overs, and the bowler quota is recomputed.
* **Given** I revise innings 0 alone, **then** the warning `CHASE_OVERS_NOT_REVISED` is shown.
* **Given** 86 balls already bowled, **when** I revise to 80 balls, **then** it's rejected with `INVALID_OVERS_REVISION`. Revising to exactly 86 completes the innings immediately.

**US-E-04 acceptance criteria**
* **Given** a chase suspended at 14.2 overs with the par score after 86 balls being 120, **when** I record `overs_revised {terminal: true, maxBalls: 86, target: 121}` while paused, **then** the chase completes with reason `terminated`, and `confirm_result` takes priority over `resume_play`.
* **Given** the chasing side is on 141/3, **then** the result is "Lions won by 21 runs (par score)" (`method: 'par_score'`). On 110 it's "<first-innings side> won by 10 runs (par score)". On exactly 120 it's "Match tied (par score)".
* **Given** the confirmation, **when** I confirm, **then** `match_ended {natural}` is recorded while still paused, and the match is `completed`.

**US-E-05 acceptance criteria**
* **Given** the fielding side commits an offence that gives the batting side 5 penalty runs in the chase, taking the total past the target, **then** the chase completes (`target_reached`) and `confirm_result` is raised.
* **Given** 5 penalty runs are awarded to the side that has not yet batted, **then** they're carried and added when its innings starts.
* **Given** 5 penalty runs to the batting side (helmet strike, Law 28.3) on the last ball of a tied chase, recorded after that ball, **then** the runs go to the just-completed chase innings and the tie becomes a win for the chasing side by wickets.
* **Given** a super over is in progress, **when** I try to put the penalty into innings 0 or 1, **then** it's rejected with `INVALID_PENALTY_INNINGS`.

**US-E-06 acceptance criteria**
* **Given** the chase reaches the target, **then** no more deliveries can be recorded, `confirm_result` shows the result text, and standings don't change until I confirm.
* **Given** I undo instead, **then** the last ball is removed and scoring continues normally.

**US-E-07 acceptance criteria**
* **Given** a tie with `superOver.enabled`, **then** `resolve_tie` offers Super Over, Accept Tie and Decide Otherwise.
* **Given** super-over round 1 is tied with `ifTiedAgain: 'repeat'`, **then** round 2 is offered, and with `restrictRepeatPlayers` batters dismissed in round 1 and round 1's bowler are ineligible.
* **Given** `ifTiedAgain: 'boundary_count'`, **then** the side with more 4s + 6s across the match and the super over wins: "Match tied — Tigers won on boundary count".
* **Given** `maxRounds` has been reached, **then** Super Over is no longer offered.

**US-E-08 acceptance criteria**
* **Given** no delivery has been recorded, **when** I choose Walkover to Tigers, **then** the result is "Tigers won by walkover" with no innings.
* **Given** at least one delivery, **then** Walkover is unavailable (`WALKOVER_AFTER_PLAY`) and Awarded is offered instead, with a mandatory reason.

---

## Epic C — Corrections

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-C-01 | As a scorer, I want Undo to reverse the last whole action (e.g. a wicket and its incoming batter), as many times as I need. | P1, P4 | MVP | §15 · FR-C-01 |
| US-C-02 | As a scorer, I want Redo after an undo during this session. | P1 | MVP | §15 · FR-C-02 |
| US-C-03 | As a scorer, I want to tap any past ball in the ball log and change it (to 0/1/2/3/4/6, wide, no-ball or wicket), with everything after it recalculated. | P1 | MVP | §16 · FR-C-03 |
| US-C-04 | As an organizer, I want a WHAT WILL CHANGE preview before a correction to a completed tournament match, showing score, result, standings, NRR and qualification changes, and I want to give a reason. | P3, P5 | MVP | §16, §99 · FR-C-04 |
| US-C-05 | As an organizer, I want to reopen a completed match (undo the result) with a reason, so that I can fix the last ball. | P3 | MVP | FR-C-05 |
| US-C-06 | As a scorer, I want to insert a forgotten event (e.g. a strike swap or a bowler change) at the right place in the log. | P1 | V1 | FR-C-06 |

**US-C-01 acceptance criteria**
* **Given** the last action was a caught wicket plus the incoming batter, **when** I tap Undo once, **then** both events are removed, the dismissed batter is back at the crease, the bowler's wickets and figures are restored, and the over position is restored.
* **Given** 30 consecutive undos, **then** each one recomputes state by replay. It never subtracts from the score.
* **Given** undo removes `match_ended` of a tournament match, **then** I must give a reason and see the impact. The action is audited as `match_reopened`.

**US-C-02 acceptance criteria**
* **Given** I undid a ball, **when** I tap Redo, **then** the identical event (same id and seq) is appended again.
* **Given** I recorded a new ball after undoing, **then** Redo is cleared. A stale redo returns `REDO_STALE`. The redo stack is also cleared when the app restarts.

**US-C-03 acceptance criteria**
* **Given** 17.3 was recorded as FOUR, **when** I change it to 1 run, **then** strike from 17.4 onwards is re-derived and re-stamped (the other batter now faces), and the batting, bowling, partnership and over data are recomputed.
* **Given** a wide is changed to a legal dot, **then** the over ends one delivery earlier, and the next over's bowler selection moves with it (re-anchoring).
* **Given** I remove a wicket but not the `batter_in` that followed it, **then** the edit is refused (`NO_VACANCY` at that seq) and the guided flow offers to remove both.
* **Given** the match is live, **then** the edit shows a warning (not a confirmation) and is still audited as `match_history_edited`.

**US-C-04 acceptance criteria**
* **Given** a completed group match whose correction flips the winner, **when** I preview, **then** the sheet lists the new result, the table positions that change ("Lions move from 2nd to 3rd in Pool A."), NRR changes, qualification changes and slots that would change (with any already-played knockout fixtures flagged).
* **Given** the preview, **when** anything in the match log changes before I tap Continue, **then** applying fails with `CONFLICT` and I'm asked to preview again (fingerprint check).
* **Given** I apply, **then** the audit entry `result_corrected` stores the removed and inserted events, my reason and the impact that was previewed.

---

## Epic SC — Scorecard, history & export

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-SC-01 | As a scorer, I want a full scorecard (batting with dismissal texts, bowling, extras breakdown, fall of wickets, partnerships, over summary). | P1 | MVP | §64, §83 · FR-SC-01 |
| US-SC-02 | As a captain, I want worm and Manhattan charts and a partnerships view. | P1, P4 | V1 | §64 · FR-SC-02 |
| US-SC-03 | As a scorer, I want an offline PDF scorecard that looks like a real scorecard, including tournament standings where relevant. | P1, P3 | MVP | §83 · FR-SC-03 |
| US-SC-04 | As a user, I want to share the PDF through the system share sheet. | P1, P4 | MVP | §95 · FR-SC-04 |
| US-SC-05 | As a user, I want match history with search (title or team), filter (status, tournament, team), sort and delete. | P1, P5 | MVP | §81 · FR-SC-05 |
| US-SC-06 | As a user, I want each history card to show both teams and scores, the result line ("Pakistan XI won by 3 runs"), overs and date. | P1 | MVP | §81 · FR-SC-06 |

**US-SC-03 acceptance criteria**
* **Given** a completed match, **when** I export a PDF in airplane mode, **then** the file contains the title, teams, venue, date, result, toss, batting (including "absent hurt" and "c sub (X) b Y"), bowling, extras, fall of wickets, partnerships and the over summary, printed in a light style whatever the app theme.
* **Given** a tournament match, **then** the PDF also includes the current standings of its pool.
* **Given** the PDF generation is interrupted, **then** no match data is affected and I can try again.

---

## Epic T — Tournament setup

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-T-01 | As an organizer, I want a wizard (Info → Teams → Structure → Rules → Pools → Fixtures → Review) that saves each step, so that I can stop and resume later. | P2, P3 | MVP | §25, §65 · FR-T-01 |
| US-T-02 | As an organizer, I want to enter tournament info (name, season, description, logo, organizer, dates, venues, location, contact, notes). | P3 | MVP | §26 · FR-T-02 |
| US-T-03 | As an organizer, I want to add teams from the library or create them (name, short name, logo, captain, players, optional seed), for up to at least 128 teams. | P3 | MVP | §27 · FR-T-03 |
| US-T-04 | As an organizer, I want to choose League, Groups, Knockout, Groups + Knockout or Custom, or start from a template. | P2, P3 | MVP | §28, §56 · FR-T-04 |
| US-T-05 | As an organizer, I want a stage builder (e.g. Group → Super 8 → SF → Final) where each stage has a type, entry rules, pools, fixture method, points, tie-breakers and match format. | P3 | MVP | §29 · FR-T-05 |
| US-T-06 | As an organizer, I want to run Cup and Plate stages fed by the same groups, and have only the Cup decide the champion. | P3 | V1 | FR-T-06 |
| US-T-07 | As an organizer, I want last year's finalists to enter the semifinal directly. | P3 | V1 | FR-T-07 |
| US-T-08 | As an organizer, I want to assign pools randomly (with an optional seed such as 847291), by seeds (snake) or manually, and see the seed used. | P3 | MVP | §30, §31 · FR-T-08 |
| US-T-09 | As an organizer, I want uneven pools (10 teams → 4/3/3), a warning that matches will differ, and a choice of how cross-pool comparisons are normalised. | P3 | MVP | §32 · FR-T-09 |
| US-T-10 | As an organizer, I want to save my tournament's structure as a template. | P2 | V1 | §56 · FR-T-10 |
| US-T-11 | As an organizer, I want to delete a tournament safely. I must type its name, and completed matches are deleted only if I explicitly opt in. | P3 | MVP | §55 · FR-T-11 |

**US-T-01 acceptance criteria**
* **Given** I completed Info and Teams and closed the app, **then** the tournament is listed with status `registration`, and opening it resumes the wizard at Structure.
* **Given** the Pools step, **then** the draw is only a preview until I save the step.

**US-T-04 acceptance criteria**
* **Given** the template `8-Team T20` and 8 teams, **then** I get a group stage with 2 pools × 4 (single round robin) and a Knockouts stage (`decidesChampion`) with entry slots A1, B1, A2, B2, fixed seeding (A1 v B2, B1 v A2), and a final fed by "Winner SF1" and "Winner SF2".
* **Given** 10 teams and that template, **then** I'm told "Designed for 8 teams; you have 10." and can continue or change it.

**US-T-08 acceptance criteria**
* **Given** 16 teams and 4 pools, **when** I tap Random, **then** a draw is shown with its seed. The same seed always gives the same pools.
* **Given** pools already exist, **when** I draw again, **then** "Current pool arrangement will be replaced." is shown first, and the previous arrangement can be restored until I save.
* **Given** fixtures exist, **then** the WHAT WILL CHANGE sheet lists the fixtures that would be regenerated.

**US-T-09 acceptance criteria**
* **Given** 10 teams in 3 pools, **then** sizes default to 4/3/3, and the warning "Teams in different pools may play different numbers of matches." is shown.
* **Given** "pool winners + best runner-up", **then** I choose `raw`, `per_match_average` or `drop_extra_results`, and the qualification screen shows the comparison table with that normalisation.

**US-T-11 acceptance criteria**
* **Given** a tournament with 12 completed matches, **when** I delete it, **then** I see the counts (matches, completed matches, events), I'm offered a backup first, and deletion requires the exact typed name and the "delete completed matches" opt-in.
* **Given** an archived tournament, **then** delete is unavailable until it's unarchived.

---

## Epic P — Pools & team changes

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-P-01 | As an organizer, I want to move a team from Pool A to Pool C and see which fixtures will be removed and created. | P3 | MVP | §33, §34 · FR-P-01 |
| US-P-02 | As an organizer, I want to swap two teams between pools. | P3 | MVP | §33 · FR-P-02 |
| US-P-03 | As an organizer, I want to replace a team (X → Y) and choose what happens to X's played results: transfer them to Y, keep them for opponents, or expunge them. | P3, P5 | MVP | §33 · FR-P-03 |
| US-P-04 | As a statistician, I want to withdraw a team and either award walkovers for its remaining fixtures or cancel them, optionally expunging its results. | P5 | MVP | FR-P-04 |
| US-P-05 | As an organizer, I want every change after fixtures exist to show POOL CHANGE IMPACT (affected fixtures, standings, qualification, NRR) with Cancel and Continue. | P3 | MVP | §34 · FR-P-05 |
| US-P-06 | As an organizer, I want to edit team seeds and see the effect on seeding and tie-breaks. | P3 | V1 | FR-P-06 |

**US-P-01 acceptance criteria**
* **Given** single round robin, where Lions (Pool A) have played 1 of 3 fixtures, **when** I move Lions to Pool C (3 teams), **then** the preview lists the 2 unplayed Pool A fixtures to be removed and 3 new Pool C fixtures to be created. The played fixture keeps its teams and stays in Pool A.
* **Given** I tap Continue, **then** exactly the previewed fixtures are deleted and created (`ChangePlan`), and the audit records `team_moved` with the impact.
* **Given** another change to the tournament after my preview, **then** applying fails with `CONFLICT` and I must preview again.

**US-P-03 acceptance criteria**
* **Given** X played 2 matches and is replaced by Y with `transfer_to_replacement`, **then** Y's row includes X's 2 results, and opponents keep theirs.
* **Given** `keep_for_opponents`, **then** X stays in the table as a non-qualifying row marked replaced, and Y starts from zero.
* **Given** `expunge`, **then** an `expunge_results` override removes every result involving X from the table, and that override is shown as a Manual Override.
* In every case Y takes X's pool place and unplayed fixtures.

**US-P-04 acceptance criteria**
* **Given** a team with 3 remaining fixtures withdraws with `walkover`, **then** 3 matches are created, each with a single `match_ended {walkover}` event for the opponent. Opponents get walkover points, and NRR is unaffected under the default policy.
* **Given** `cancel`, **then** the 3 fixtures become `cancelled` and count for nobody.
* **Given** the team is withdrawn, **then** it never occupies a qualification slot, even if it would rank high enough.

---

## Epic F — Fixtures

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-F-01 | As an organizer, I want to generate single, double or n-leg round robin fixtures per pool (with per-pool legs), preview them, edit them, and confirm. | P3, P5 | MVP | §35, §36 · FR-F-01 |
| US-F-02 | As an organizer, I want to add a match manually (stage, pool, teams, date, time, venue, format, overs, notes). | P3 | MVP | §37 · FR-F-02 |
| US-F-03 | As an organizer, I want to edit fixture teams, date, time, venue, stage, pool, format and overs, with played fixtures protected. | P3 | MVP | §38 · FR-F-03 |
| US-F-04 | As an organizer, I want to postpone, reschedule, cancel and restore fixtures. | P3, P5 | MVP | §39 · FR-F-04 |
| US-F-05 | As an organizer, I want to start a fixture's match and have it open the same match setup and scoring screens, with teams and rules pre-filled. | P1, P3 | MVP | §66 · FR-F-05 |
| US-F-06 | As an organizer, I want a knockout bracket with byes for uneven counts, standard seeding and an optional third-place play-off. | P3 | MVP | §46 · FR-F-06 |
| US-F-07 | As an organizer, I want to replay an abandoned fixture when the stage allows it, keeping the abandoned match in history. | P3 | V1 | §39 · FR-F-07 |
| US-F-08 | As an organizer, I want an optional scheduler that puts N matches per day on given dates and times without double-booking a team on the same day. | P3 | V1 | FR-F-08 |

**US-F-01 acceptance criteria**
* **Given** a 5-team pool, single round robin, **then** 5 rounds are generated, each with one team having a bye. Every pair meets once, no team plays twice in a round, and home/away (side A) is balanced within 1.
* **Given** a 3-team pool set to 2 legs next to 4-team single-leg pools, **then** the second leg in the 3-team pool raises no duplicate-encounter warning.
* **Given** the preview, **then** nothing is saved until I Confirm. Regenerating replaces only fixtures without a match.

**US-F-05 acceptance criteria**
* **Given** a semifinal fixture "A1 v B2" whose slots resolve to Tigers and Eagles, **when** I start the match, **then** the match is created with Tigers v Eagles and the stage's format and rules. From then on the fixture's teams are frozen to Tigers v Eagles (`matchSides`).
* **Given** the stage's `tiedMatch: 'super_over'`, **then** the match is created with super overs enabled.
* **Given** the match completes, **then** the fixture shows `completed`, the tournament revision increases, and standings and qualification refresh with no further action.

**US-F-06 acceptance criteria**
* **Given** 6 knockout entrants, **then** the bracket has size 8, seeds 1 and 2 get byes into the semifinals, round 1 pairs 3 v 6 and 4 v 5, and seeds 1 and 2 can only meet in the final.
* **Given** `thirdPlacePlayoff`, **then** a "Third place" fixture is fed by both semifinal losers and never decides the champion.

---

## Epic ST — Standings, points, NRR & tie-breakers

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-ST-01 | As a statistician, I want to configure win, tie, no-result and loss points (e.g. 2/1/1/0, 3/1/1/0, 20/10/5/0), plus abandoned and walkover points, and how super-over-decided ties count. | P5 | MVP | §40 · FR-ST-01 |
| US-ST-02 | As a statistician, I want an optional bonus point for a run-rate ratio. | P5 | V1 | FR-ST-02 |
| US-ST-03 | As a statistician, I want to configure the NRR method (ICC or actual overs) and how no result, abandoned, walkover, awarded and revised-target matches are treated. | P5 | MVP | §41 · FR-ST-03 |
| US-ST-04 | As an organizer, I want an ordered tie-breaker chain (e.g. Points → NRR → H2H → Wins → Organizer decision), overridable per stage. | P3, P5 | MVP | §43 · FR-ST-04 |
| US-ST-05 | As a viewer, I want standings with Pos, Team, P, W, L, NR, Pts and NRR, pool tabs, an overall table, matches remaining, form, and a qualification indicator that isn't shown by colour alone. | P3, P5 | MVP | §42, §50 · FR-ST-05 |
| US-ST-06 | As a statistician, I want to see why a team is above another ("Ahead of Lions on net run rate (+0.512 vs +0.231)"). | P5 | MVP | §98 · FR-ST-06 |
| US-ST-07 | As a statistician, I want to apply a points deduction with a reason and later revoke it. | P5 | MVP | §47 · FR-ST-07 |
| US-ST-08 | As a statistician, I want to be told when a tie at a qualification boundary needs my decision, and to resolve it by organizer decision or a recorded draw of lots. | P5 | MVP | FR-ST-08 |

**US-ST-03 acceptance criteria**
* **Given** ICC mode, where team A is all out for 150 in 32.1 of 40 overs, **then** A is treated as having faced 40 overs (240 balls), and the opponent as having bowled 40.
* **Given** B chases 151 in 30.2 overs, **then** B's actual balls (182) are used.
* **Given** a no-result match and `includeNoResult: false`, **then** it's excluded from NRR but counted as P and NR.
* **Given** a chase with a revised target and `revisedTarget: 'icc_par'`, **then** the side batting first is credited with target − 1 runs off the chasing side's allotted balls.
* **Given** a super over was played, **then** its runs never count in NRR.

**US-ST-08 acceptance criteria**
* **Given** a complete pool where 2nd and 3rd are level after every criterion and the top 2 qualify, **then** the table lists them under `unresolvedTies` with "Level with Lions — organizer decision required", and the slot stays provisional.
* **Given** the same level pair while matches remain, **then** it's only a `provisionalTies` entry with no call to action.
* **Given** I choose Draw of Lots, **then** the app draws with a seed that is recorded and shown, stores a `tie_resolution` override (`draw_lots`) with my reason, and the table order follows it.

---

## Epic Q — Qualification, knockouts & overrides

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-Q-01 | As an organizer, I want to define how teams enter a stage: top N per pool, a specific pool position, best of a position (e.g. best 2 runners-up), top N overall, knockout winners, organizer-selected, or direct entry. | P3 | MVP | §44 · FR-Q-01 |
| US-Q-02 | As an organizer, I want those rules expanded into named slots (A1, B2, "Best runner-up", "Winner SF1") that I can edit individually. | P3 | MVP | §45 · FR-Q-02 |
| US-Q-03 | As a viewer, I want each team's status (Qualified, In contention, Eliminated) with its certainty and a sentence explaining why. | P3, P5 | MVP | §51, §98 · FR-Q-03 |
| US-Q-04 | As an organizer, I want to seed knockouts fixed (A1 v B2, B1 v A2), by random draw, or by ranking, with ranking only allowed once every qualifier is final. | P3 | MVP | §46 · FR-Q-04 |
| US-Q-05 | As an organizer, I want knockout ties and no-results handled by policy (super over / higher seed / organizer, and higher seed / replay / organizer / shared). | P3 | MVP | §46 · FR-Q-05 |
| US-Q-06 | As an organizer, I want to manually qualify, eliminate or reassign a team, with a reason, shown as "Manual Override" and audited. | P3 | MVP | §47 · FR-Q-06 |
| US-Q-07 | As an organizer, I want a correction to a group result after the semifinal was played never to rewrite that semifinal, and I want to see the conflict. | P3 | MVP | FR-Q-07 |
| US-Q-08 | As an organizer, I want the champion to come from the stage I mark as deciding it, and to be able to declare joint champions after a washed-out final. | P3 | MVP | §82 · FR-Q-08 |

**US-Q-03 acceptance criteria**
* **Given** Tigers cannot finish outside the top 2 whatever the remaining results, **then** they're `qualified` with certainty `mathematical` and the text reads "Tigers have mathematically qualified for the Semifinal as Pool A winners (Top 2 from each pool; Points → NRR → Head-to-Head)."
* **Given** qualification depends on NRR not yet known, **then** the status is `in_contention`. The app never claims qualification by assuming a favourable NRR.
* **Given** more than 8 fixtures are still undecided, **then** bounds reasoning is used and a status may stay "in contention" rather than risk a wrong "qualified".
* **Given** Cup and Plate stages, **then** a team can read "Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd."

**US-Q-05 acceptance criteria**
* **Given** a semifinal tied after the super over(s) with `tiedMatch: 'super_over'`, **then** the winner slot stays pending and "organizer decision required" is shown until a decision (`tie_decided`) or an override is recorded.
* **Given** a washed-out quarterfinal with `noResult: 'higher_seed'`, **then** the entrant with the better slot seed advances, with the explanation. If both seeds are unknown, an organizer decision is required.
* **Given** a washed-out final with `noResult: 'shared'`, **then** both teams are joint champions (`basis: 'shared'`), shown as "Lions & Tigers" in the tournaments list.

**US-Q-07 acceptance criteria**
* **Given** SF1 (A1 v B2) was played as Tigers v Eagles, **when** a Pool A correction makes Lions the new A1, **then** the preview reports a slot conflict listing SF1 as played. On Continue, SF1, "Winner SF1" and the final are unchanged. I can instead pin A1 to Tigers with a `slot_assignment` override. Either way the choice is audited.

---

## Epic D — Dashboard, statistics, what-if & audit

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-D-01 | As an organizer, I want a dashboard showing the tournament name, teams, pools and format, current stage, progress (24/48), next match, standings and recent results, without a card for every statistic. | P3 | MVP | §49, §80 · FR-D-01 |
| US-D-02 | As a statistician, I want team, player and tournament statistics (runs, average, strike rate, 4s, 6s, wickets, economy, best score, best bowling, highest partnership…) computed on the device. | P5 | MVP | §52 · FR-D-02 |
| US-D-03 | As a statistician, I want to simulate hypothetical results ("What if Syston beat Kibworth by 40 runs?") and see table and qualification consequences without changing real data. | P5 | V1 | §48 · FR-D-03 |
| US-D-04 | As an organizer, I want an audit log of every structural change, override and correction, with the previous value, new value, time and reason. | P3, P5 | MVP | §53 · FR-D-04 |
| US-D-05 | As an organizer, I want a bracket view showing byes and slot labels until teams are known. | P3 | MVP | §46 · FR-D-05 |
| US-D-06 | As an organizer, I want the tournaments list to show the name, team count, status and champion, and completed tournaments to show final standings, the bracket, statistics and the match list. | P3 | MVP | §82 · FR-D-06 |
| US-D-07 | As an organizer, I want a tournament PDF (standings, bracket, results, statistics). | P3, P5 | V1 | §82 · FR-D-07 |

**US-D-03 acceptance criteria**
* **Given** two unplayed fixtures, **when** I set "Syston win" and "Kibworth v Oadby tied, Oadby won the super over", **then** the simulated table and qualification are shown next to the current ones with a narrative ("If Syston beat Kibworth, …"). The real tournament, its revision and the audit log are unchanged.
* **Given** I give scores, **then** NRR moves as well. Without scores only points move.
* **Given** a hypothetical for a fixture whose sides aren't resolved yet, **then** it's skipped and I'm told why.

---

## Epic B — Backup & data

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-B-01 | As a user, I want to export a full, tournament or single-match backup as a JSON file and share it. | P3, P5 | MVP | §84 · FR-B-01 |
| US-B-02 | As a statistician, I want to import a backup and see what it contains, whether it was already imported, and what conflicts with my data, before anything changes. | P5 | MVP | §84 · FR-B-02 |
| US-B-03 | As a statistician, I want to choose to skip existing items, import them as a copy, or replace my local versions (after seeing what local-only data would be lost). | P5 | MVP | §84 · FR-B-03 |
| US-B-04 | As an organizer, I want a reminder to back up when a tournament is completed. | P3 | V1 | R10 · FR-B-04 |
| US-B-05 | As a privacy-conscious user, I want no account, no tracking and no network use. | All | MVP | §85 · NFR-O |
| US-B-06 | As a user, I want a diagnostics screen (integrity check, matches that need repair), so that I can report problems. | P5 | V1 | §86 · FR-B-06 |

**US-B-02 acceptance criteria**
* **Given** a file with a newer schema, **then** the import is refused ("This backup was made by a newer version of Scorebook.").
* **Given** a file whose checksum doesn't match, or a missing reference, or a match log that doesn't replay, **then** the preview lists the error with its JSON path and the import is disabled.
* **Given** a file whose `exportId` was already imported, **then** the preview says "Already imported on 12 Jun 2026" and lists the conflicting tournaments and matches.

**US-B-03 acceptance criteria**
* **Given** `skip_existing`, **then** no row of a conflicting aggregate is inserted (never a merged tournament), and library teams, players and venues that already exist are reused.
* **Given** `import_as_copy`, **then** every id in the file is remapped, the copies are inserted as new tournaments or matches, every copied match replays with zero issues, and nothing local changes.
* **Given** `replace_existing`, **then** the preview first lists local-only matches and events that would be lost. After confirmation each conflicting aggregate is deleted explicitly and re-inserted from the file, in one transaction.
* **Given** the device dies during the import, **then** on relaunch nothing from the file is present, and the import can be repeated.

---

## Epic A — Settings & accessibility

| ID | Story | Persona | Priority | Trace |
|---|---|---|---|---|
| US-A-01 | As a user, I want Light, Dark and System themes that are readable in sunlight and at night. | P1, P5 | MVP | §68–§70 · FR-A-01 |
| US-A-02 | As a user, I want haptics, sound and reduced motion to be switchable. | P1, P2 | MVP | §75–§78 · FR-A-02 |
| US-A-03 | As a scorer, I want scoring preferences (confirm innings end, auto-open the bowler picker, dot as `0` or `•`, keep the screen awake). | P1 | MVP | FR-A-03 |
| US-A-04 | As a screen-reader user, I want every control and ball token spoken ("Wide, plus one run", "Wicket, caught"), so that I can score or follow a match. | P5 | MVP | §78 · NFR-A |
| US-A-05 | As a user with large text, I want the score, overs and pad to stay visible at 200% font scale. | P5 | MVP | §78 · NFR-A |
| US-A-06 | As a user, I want errors in plain language with a way forward, and technical detail only on the diagnostics screen. | All | MVP | §86 · FR-A-06 |

**US-A-06 acceptance criteria**
* **Given** a ball can't be saved (e.g. the disk is full), **then** I see "Couldn't save this delivery. Your previous match data is still safe. [Try Again]". The score on screen stays at the last saved ball, and the technical cause is recorded for diagnostics.
