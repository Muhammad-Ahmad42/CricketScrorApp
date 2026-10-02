# Scorebook — Business Rules

§102 product item 6, §4 phase 2 ("business rules, cricket scoring rules, tournament rules").

These rules are **binding for the engines** and consistent with the frozen contract. Each rule cites the type, field, function or validation code that carries it (see [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md)). Where a rule is a Laws-of-Cricket decision, the Law is named. Behaviour in unusual situations is in [EDGE_CASES.md](EDGE_CASES.md).

Rules are numbered `BR-<area>-NN`. The areas are:

| Area | Code |
|---|---|
| Match configuration | MC |
| Deliveries, runs and extras | DR |
| Strike and free hit | SF |
| Bowling | BW |
| Dismissals | DS |
| Batters and retirements | BT |
| Innings completion and targets | IN |
| Overs revision and par score | RV |
| Penalty runs | PN |
| Suspension | SU |
| Results, ties and super overs | RS |
| Match lifecycle | ML |
| Undo, redo and historical edit | CR |
| Tournament structure and lifecycle | TS |
| Pools | PL |
| Fixtures | FX |
| Points | PT |
| Net run rate | NR |
| Tie-breakers | TB |
| Qualification and slots | QL |
| Knockouts and champion | KO |
| Manual overrides | OV |
| Change control, impact and audit | CC |
| Data and backup | DB |

---

## 1. Match configuration (MC)

| ID | Rule | Carried by |
|---|---|---|
| BR-MC-01 | Every match stores its complete rule set. Presets (T5–T50, user presets) only pre-fill it, so editing a preset never changes an existing match. | `Match.rules`, `FormatPreset` |
| BR-MC-02 | `oversPerInnings` is an integer ≥ 1 with no fixed menu (e.g. 17). `ballsPerOver` is an integer 1–12, default 6. | `MatchRules`, `validateRules` (`OVERS_INVALID`, `BALLS_PER_OVER_INVALID`) |
| BR-MC-03 | `playersPerSide` is 2–15. A team may field a different number in one match (`teamAPlayers` / `teamBPlayers`, 2–15). Each team's effective size is `MatchTeam.playersInSide = teamXPlayers ?? playersPerSide`. | `Match.teamAPlayers/teamBPlayers`, `MatchTeam.playersInSide` |
| BR-MC-04 | A team's regular-innings all-out threshold is `playersInSide − 1` wickets, or `playersInSide` with `lastManStands`. It is **never** derived from how many players are in the squad. | `InningsLimits.maxWickets` |
| BR-MC-05 | A super-over innings allows `superOver.overs × ballsPerOver` balls and ends at `min(superOver.maxWickets, threshold of BR-MC-04)` wickets. Defaults: 1 over, 2 wickets. | `SuperOverRule`, `InningsLimits` |
| BR-MC-06 | Bowler quota `uniform`: each bowler may bowl at most `maxOversPerBowler` distinct overs (`null` = unlimited). Presets default to ⌈overs ÷ 5⌉, minimum 1 (T20 → 4, T50 → 10, 6 overs → 2). | `BowlerQuotaMode`, `defaultMaxOversPerBowler` |
| BR-MC-07 | Bowler quota `icc_one_fifth`: with O = ⌈maxBalls ÷ ballsPerOver⌉, each bowler may bowl ⌊O ÷ 5⌋ overs (minimum 1), and only (O mod 5) bowlers may bowl one extra over. For 17 overs that means 3 each, and two bowlers may bowl a 4th. It is recomputed after every overs revision, and `maxOversPerBowler` is ignored. | `InningsLimits.extraOverBowlers` |
| BR-MC-08 | The quota counts **distinct overs in which the bowler delivered at least one ball**. Part of an over bowled as a mid-over replacement counts as one over. | `BowlingCardRow.oversUsed` |
| BR-MC-09 | Rules whose quota makes an innings impossible (non-substitute bowlers × quota < overs) produce the warning `BOWLER_QUOTA_TOO_LOW`. It is a warning, not a block. | `validateRules` |
| BR-MC-10 | The toss is optional. When recorded, the first innings' batting team must match it (winner chose bat → winner bats; chose bowl → the other side bats), or `TOSS_MISMATCH`. | `Toss`, `InningsStartedPayload` |
| BR-MC-11 | A squad member marked `isSubstitute` (Law 24) may only field: they can catch or be involved in a run out, but may never open, bat, bowl, appear on the batting card or count toward the side's players (`SUBSTITUTE_NOT_ALLOWED`). | `MatchPlayer.isSubstitute` |
| BR-MC-12 | A player may play for a team other than their home team in a given match (a guest). The side for that match is `MatchPlayer.teamId`. | `MatchPlayer.teamId` |
| BR-MC-13 | Squads may grow at any time, including mid-innings. The squad row is written before the event that refers to it, in the same transaction. | `MatchService.addSquadPlayer` |
| BR-MC-14 | A squad member referenced by any event (delivery columns or payloads, including an opener who never faced, an over-start bowler replaced before the first ball, a fielder or an absentee) can never be removed. | FK `(match_id, player_id) → match_players`, `removeSquadPlayer` |
| BR-MC-15 | Powerplay over numbers are 1-based and inclusive, e.g. `{fromOver: 1, toOver: 6}`. Only phase status and totals are reported; fielding restrictions are not enforced. | `PowerplayRule`, `PowerplayStatus` |

## 2. Deliveries, runs and extras (DR)

| ID | Rule | Carried by |
|---|---|---|
| BR-DR-01 | Only observed facts are stored for a delivery: the umpire's call (`fair` / `wide` / `no_ball`), where the runs go (`bat` / `bye` / `leg_bye`, none for wides), runs physically run (`runsRun`), short runs, boundary allowance (0/4/6), the wicket, and context stamps. Over and ball numbers, legality, totals, strike, free hit, completion and results are always derived. | `DeliveryPayload`, `BallRecord` |
| BR-DR-02 | `runsRun` is 0–9 (`INVALID_RUNS`). `shortRuns` is 0 to `runsRun` (`INVALID_SHORT_RUNS`, Law 18.5). `boundary` is 0, 4 or 6 (`INVALID_BOUNDARY`). | `validateEvent` |
| BR-DR-03 | Runs scored by running = `runsRun − shortRuns`. Runs credited on the delivery = those + `boundary`. | `BallRecord` |
| BR-DR-04 | A 6 is only possible off the bat on a fair ball or no-ball (`SIX_NOT_OFF_BAT`). Byes, leg-byes and wides can carry a boundary of at most 4. | `validateEvent` |
| BR-DR-05 | A boundary with `runsRun > 0` is an overthrow boundary. For example, 1 + 4 overthrows = 5 runs, strike rotates, and it is not a "4". The batter's 4s/6s columns count only bat boundaries with `runsRun = 0`, so an all-run four is 4 runs but not a "4". | `BallRecord.isFour/isSix` |
| BR-DR-06 | Scored running runs ≥ 5 without a boundary raise the non-blocking warning `UNUSUAL_RUNS`. | `EVENT_WARNING_CODES` |
| BR-DR-07 | A fair ball is legal. A wide or no-ball is legal (counts toward the over) only when its rule has `countsAsBall: true`. Otherwise it is re-bowled (`isReBowled`). | `WideRule`, `NoBallRule`, `BallRecord.isLegal` |
| BR-DR-08 | Balls faced = fair deliveries + no-balls received as striker. A wide is never a ball faced, even when it counts toward the over. | `BallRecord.isBallFaced` |
| BR-DR-09 | **Wides:** every run on a wide is a wide: penalty (default 1, may be 0) + scored running runs + boundary. The whole amount is charged to the bowler. | `ExtrasBreakdown.wides` |
| BR-DR-10 | **No-balls:** the penalty (default 1) is a no-ball extra charged to the bowler. Runs off the bat go to the batter and are also charged to the bowler. Runs to `bye` or `leg_bye` off a no-ball are byes or leg-byes and are **not** charged to the bowler (Law 21.10). NB + 2 byes = nb 1 + b 2. | `ExtrasBreakdown.noBalls/byes/legByes` |
| BR-DR-11 | Byes and leg-byes (off fair balls or no-balls) are never charged to the bowler. A legal bye or leg-bye ball is a dot for the bowler. | `BowlingCardRow.dots` |
| BR-DR-12 | Runs charged to the bowler = wides + no-ball penalty + bat runs. | `BallRecord.bowlerRuns` |
| BR-DR-13 | Extras total = wides + no-balls + byes + leg-byes + penalty runs. | `ExtrasBreakdown.total` |
| BR-DR-14 | Numbering: `overIndex` = ⌊legal balls before ÷ bpo⌋. `ballInOver` = legal balls already bowled in the over + 1, so a wide after two legal balls is "x.3" and so is the next legal ball. `deliveryInOver` counts every delivery. | `BallRecord.label` |
| BR-DR-15 | **Maiden:** a complete over (all `ballsPerOver` legal balls) bowled entirely by one bowler with 0 runs charged to that bowler. Wides and no-balls break a maiden; byes and leg-byes don't. Split or incomplete overs are never maidens. | `OverSummary.isMaiden` |
| BR-DR-16 | Rates are unrounded in calculations and rounded only for display: CRR = runs ÷ (legal balls ÷ bpo); economy = runs conceded ÷ (legal balls ÷ bpo); SR = runs × 100 ÷ balls faced; RRR = runs required ÷ (balls remaining ÷ bpo). A rate with a 0 denominator is `null` and shown as "–". | `stats.ts`, `format.ts` |
| BR-DR-17 | Overs are shown as `o.b` in the match's balls per over: 100 balls at 6 per over is "16.4", 10 balls at 8 per over is "1.2". Decimal overs (100 ÷ 6 = 16.667) are used only in calculations. | `formatOvers`, `ballsToOvers` |

## 3. Strike and free hit (SF)

| ID | Rule | Carried by |
|---|---|---|
| BR-SF-01 | Strike changes when `runsRun` is **odd**. This counts physical crossings, including byes, leg-byes, the running part of wides and no-balls, and short runs. So "ran 2, one short" scores 1 with no change of ends. A boundary allowance never changes strike. | `replay.ts` step 5 |
| BR-SF-02 | Order on a delivery: apply the runs rotation, then the dismissal vacancy, then the end-of-over swap. | `replay.ts` steps 5, 6, 8 |
| BR-SF-03 | After the over's last legal ball the batters swap positions for the next over. A vacancy swaps too. | `replay.ts` step 8 |
| BR-SF-04 | Strike can be swapped manually between deliveries to correct it (§11, §19). It is recorded as an undoable event. | `strike_swapped` |
| BR-SF-05 | A last-man-stands lone batter is always on strike. Neither odd runs nor over ends move them, and `nonStrikerId` is null. | `DeliveryCommon.nonStrikerId` |
| BR-SF-06 | Strike is derived, never stored as truth. Delivery stamps must match the derived context on append (`CONTEXT_MISMATCH`). On replay a mismatch is only a warning, and the delivery is applied with the derived context. | `ValidationMode` |
| BR-SF-07 | With `noBall.freeHit`, the delivery after any no-ball is a free hit. The free hit carries over while the free-hit delivery is itself a wide or no-ball, and is cleared by the next fair ball. | `InningsState.isFreeHitNext` |
| BR-SF-08 | On a free hit the striker can only be out by run out, hit the ball twice, obstructing the field or handled the ball (`DISMISSAL_NOT_ALLOWED_ON_FREE_HIT`). | `allowedDismissals` |

## 4. Bowling (BW)

| ID | Rule | Carried by |
|---|---|---|
| BR-BW-01 | Every over needs a selected bowler before its first delivery (`BOWLER_NOT_SELECTED`). The first over's bowler comes from `innings_started`. | `PendingAction.select_next_bowler` |
| BR-BW-02 | `over_start` selection is valid only when 0 deliveries have been bowled in the over. Re-selecting before the first ball just corrects the choice. | `BowlerSelectionReason` |
| BR-BW-03 | A mid-over change needs reason `injury` (Law 17.8; the replaced bowler may bowl again later) or `suspended` (Law 41; the replaced bowler is `removed_from_attack` for the rest of the innings). Any other combination is `BOWLER_CHANGE_REASON_INVALID`. | `BowlerSelectedPayload` |
| BR-BW-04 | A wrong bowler noticed mid-over is not a new event. It is corrected with a history edit of the over-start selection. | `history.normalizeLog` |
| BR-BW-05 | The replacement is credited with the rest of the over. Neither bowler can earn a maiden for that over, and both are that over's bowlers for the consecutive-overs rule. | `OverSummary.bowlerIds` |
| BR-BW-06 | Unless `allowBowlerConsecutiveOvers`, a bowler who bowled (any part of) the previous over may not bowl the next (`BOWLER_CONSECUTIVE_OVERS`, Law 17.6). | `bowlerEligibility` |
| BR-BW-07 | Bowler candidates are non-substitute members of the fielding squad. Ineligible candidates are listed with a reason: `bowled_previous_over`, `quota_reached`, `replaced_this_over`, `removed_from_attack`, `bowled_previous_super_over`. | `BowlerIneligibility` |
| BR-BW-08 | Starting a bowler's final quota over raises `BOWLER_QUOTA_LAST_OVER` as a non-blocking warning. | `EVENT_WARNING_CODES` |
| BR-BW-09 | Bowling order is the order in which bowlers first bowled. | `BowlingCardRow.order` |

## 5. Dismissals (DS)

| ID | Rule | Carried by |
|---|---|---|
| BR-DS-01 | Dismissals allowed by call: **fair**: all nine delivery dismissals. **Wide**: stumped, hit wicket, run out, obstructing, handled. **No-ball**: run out, hit the ball twice, obstructing, handled. Otherwise `DISMISSAL_NOT_ALLOWED_ON_CALL`. | `allowedDismissals` |
| BR-DS-02 | Bowled, caught, lbw, stumped, hit wicket and hit the ball twice dismiss the **striker** and allow no runs (`runsRun = 0`, `boundary = 0`, else `RUNS_NOT_ALLOWED_WITH_DISMISSAL`). A stumping off a wide still scores the wide penalty. | `DeliveryWicket` |
| BR-DS-03 | Run out, obstructing the field and handled the ball require `dismissalEnd` (`DISMISSAL_END_REQUIRED`). For any other type it must be null (`DISMISSAL_END_NOT_ALLOWED`). The dismissed batter may be striker or non-striker. The not-out batter goes to the other end, and the incoming batter takes `dismissalEnd`. | `CreaseEnd` |
| BR-DS-04 | Runs completed before a run out count (`runsRun`). | `DeliveryCommon.runsRun` |
| BR-DS-05 | After a striker-only dismissal the incoming batter takes the striker's end. After a catch the new batter faces the next ball unless the over has ended (Law 18.11, 2022). | `replay.ts` step 6 |
| BR-DS-06 | Wicket credited to the bowler **only** for bowled, caught, lbw, stumped and hit wicket. Never for run out, obstructing, hit the ball twice, handled, timed out or any retirement. | `BOWLER_CREDITED_DISMISSALS`, `DismissalRecord.creditedBowlerId` |
| BR-DS-07 | Fielders are 0–2 players of the **fielding** side (substitutes included; `FIELDER_NOT_IN_FIELDING_SIDE`, `TOO_MANY_FIELDERS`). Caught uses the catcher (the bowler for "c & b"), stumped the keeper, run out the thrower and then the wicket-breaker ("Smith/Jones"). | `DeliveryWicket.fielderIds` |
| BR-DS-08 | Fielders are optional. A caught or stumped dismissal without a fielder raises `FIELDER_UNKNOWN`, renders "c ? b Hassan", and credits no catch. A stumping with no fielder defaults to the fielding side's designated wicket-keeper. | `buildEvents` |
| BR-DS-09 | Off-ball dismissals don't count a delivery and are never credited to the bowler: `timed_out` (the incoming batter; the vacancy stays open), `run_out` of a non-striker backing up (Law 38.3), `obstructing_field` between deliveries. | `BatterDismissedPayload` |
| BR-DS-10 | `retired_out` is a wicket: it appears in the fall of wickets, and the batter can never resume. | `RETIREMENT_KINDS` |
| BR-DS-11 | **Law 16.6:** in a chase (regular or super over), a delivery may not carry a wicket if the runs it credits before the wicket (penalty + scored running runs + boundary) already reach the target (`WICKET_AFTER_RESULT`). A wicket that falls with the scores only level still counts. | `validateEvent` |
| BR-DS-12 | Dismissal text uses scorebook notation: `b X`, `c Y b X`, `c & b X`, `c ? b X`, `c sub (Z) b X`, `lbw b X`, `st Y b X`, `hit wicket b X`, `run out (A/B)`, `run out (sub (Z))`, `run out`, `obstructing the field`, `hit the ball twice`, `handled the ball`, `timed out`, `retired out`. | `dismissalText` |
| BR-DS-13 | The fall of wickets records the wicket number, the team score, and the over label of the wicket ball (or of the last legal ball for an off-ball dismissal). | `FallOfWicket` |

## 6. Batters and retirements (BT)

| ID | Rule | Carried by |
|---|---|---|
| BR-BT-01 | An incoming batter fills an existing vacancy only (`NO_VACANCY`, `POSITION_NOT_VACANT`). A delivery can't be recorded while a vacancy is open (`VACANCY_MUST_BE_FILLED` / `PENDING_ACTION_REQUIRED`). | `BatterInPayload` |
| BR-BT-02 | Incoming-batter order offered: yet-to-bat (by planned batting order, then name), then `retired_hurt`, then `retired_not_out` (only when no yet-to-bat batter remains). Out, retired-out and absent players, substitutes, the batter already at the crease, and (from super-over round 2 with `restrictRepeatPlayers`) batters dismissed in earlier super overs are never offered. | `eligibleIncomingBatters` |
| BR-BT-03 | `retired_hurt` and `retired_not_out` are **not** wickets. The batter is "not out" and may resume and continue their score (`returnedFromRetirement`). | `BattingCardRow` |
| BR-BT-04 | Retirements happen between deliveries and open a vacancy at the retiring batter's position. | `BatterRetiredPayload` |
| BR-BT-05 | **Mandatory retirement is advisory.** A batter at the crease who reaches `atRuns` (immediately, or once the over ends with `timing: 'end_of_over'`) is listed in `retirementsDue` only while a yet-to-bat batter remains. It never blocks scoring. The recorded retirement is `retired_not_out`. The batter may return only when no yet-to-bat batter remains and `mayReturn` is set. A batter who has returned is never listed again. | `MandatoryRetirementRule`, `MatchState.retirementsDue` |
| BR-BT-06 | A new partnership starts whenever either batter changes. A retirement closes one partnership and opens another with the **same** wicket number. `balls` = legal deliveries during the partnership. | `Partnership` |
| BR-BT-07 | `innings_ended {batters_unavailable}` ends an innings whose vacancy can't be filled. It counts as **all out** for the result text and NRR. `absentees` must be batting-side players who are yet to bat or retired hurt (`INVALID_ABSENTEE`). They show as "absent hurt" or "absent", not "did not bat". | `InningsEndedPayload`, `BatterStatus 'absent'` |
| BR-BT-08 | `innings_ended {declared}` closes the innings by choice. Absentees must be empty. | `InningsEndedPayload` |
| BR-BT-09 | Batting card rows are ordered by arrival at the crease, then planned order. Strike rate is `null` with 0 balls. | `BattingCardRow.position` |

## 7. Innings completion and targets (IN)

| ID | Rule | Carried by |
|---|---|---|
| BR-IN-01 | Computed completion, checked after each event in this order (first match wins): chase runs ≥ target → `target_reached`; wickets ≥ `maxWickets` → `all_out`; legal balls ≥ `maxBalls` → `overs_complete`. | `InningsCompletionReason` |
| BR-IN-02 | Explicit completion: `declared`, `batters_unavailable` (innings_ended), `match_ended` (match closed mid-innings), `terminated` (terminal overs revision). | `InningsCompletionReason` |
| BR-IN-03 | A completed innings never reopens for deliveries. Penalties may still change its total (BR-PN-05). | `InningsState.status` |
| BR-IN-04 | The chase target = the first innings' runs (including penalties) + 1, unless revised. The second innings of each super-over pair has target = the first super-over innings + 1. | `TargetInfo` |
| BR-IN-05 | Innings 1 must be batted by the other team (`WRONG_BATTING_TEAM`). Innings indexes are contiguous (`WRONG_INNINGS_INDEX`). | `InningsStartedPayload` |
| BR-IN-06 | A chase shows runs required, balls remaining and RRR ("Need 23 from 14 balls"). | `ChaseState`, `formatRequirement` |
| BR-IN-07 | `all_out` and `batters_unavailable` both count as all out for NRR. | `InningsSummary.allOut` |

## 8. Overs revision and par score (RV)

| ID | Rule | Carried by |
|---|---|---|
| BR-RV-01 | An overs revision targets the current innings or a not-yet-started regular innings. A completed innings can't be revised (`INVALID_OVERS_REVISION`). | `OversRevisedPayload` |
| BR-RV-02 | `maxBalls` is in legal balls, ≥ 1 and ≥ balls already bowled. Setting it equal to the balls bowled completes the innings at once (`overs_complete`). | `OversRevisedPayload.maxBalls` |
| BR-RV-03 | `target` may be set only for a chase innings (`INVALID_TARGET` otherwise). `null` keeps the standard target. A chase played out to a revised target reads "(revised target)" (`method: 'revised_target'`). | `MatchResult.win.method` |
| BR-RV-04 | A later revision of the same innings supersedes earlier ones. The bowler quota is recomputed. Powerplays are clamped to the new limit unless replacements are given. | `OversRevisedPayload` |
| BR-RV-05 | Reducing innings 0 without planning innings 1 raises `CHASE_OVERS_NOT_REVISED`. The "both innings" scope records both revisions as one action. | `revise_overs {scope}` |
| BR-RV-06 | The app does **not** compute DLS. The organizer types the target or par. The optional suggestion is `⌊first-innings runs × chase balls ÷ first-innings balls⌋ + 1` (average run rate). | `suggestRevisedTarget` |
| BR-RV-07 | **Terminal revision** (play will not resume): allowed only for the chase in progress, with `maxBalls` = balls bowled and a target = par + 1. It may be recorded while play is suspended. The innings completes as `terminated`. | `OversRevisedPayload.terminal` |
| BR-RV-08 | Par-score result (par = target − 1): chase runs > par → the chasing side wins by (runs − par) **runs**; runs = par → tie; runs < par → the side batting first wins by (par − runs) runs. Text: "Lions won by 21 runs (par score)" / "Match tied (par score)". | `computeNaturalResult`, `method: 'par_score'` |
| BR-RV-09 | Replay re-checks completion, the natural result and the pending action after every revision. A revised target at or below the current chase runs → `target_reached`. | `replay.ts` steps 9–12 |

## 9. Penalty runs (PN)

| ID | Rule | Carried by |
|---|---|---|
| BR-PN-01 | Penalty runs (Law 41, usually 5) are a separate event naming the team and the innings. Runs are 1–99 (`INVALID_PENALTY`). They appear as extras "p". | `PenaltyAwardedPayload` |
| BR-PN-02 | **Phases:** innings 0 and 1 are the main-match phase. Each super-over round (innings 2k+2 and 2k+3) is its own phase. A penalty never crosses phases, so a super-over penalty can never change a main-match total. | `INVALID_PENALTY_INNINGS` |
| BR-PN-03 | Within the current phase the innings must be one of: the innings the team is batting now; the team's most recent innings of the phase, even if just completed; or the team's not-yet-started innings of the phase (carried and applied when it starts). | `MatchState.carriedPenalties` |
| BR-PN-04 | A penalty on an in-progress chase can complete it (`target_reached`). A penalty on a completed first innings raises the chase target. | `replay.ts` |
| BR-PN-05 | A penalty on a completed chase changes its runs and recomputes the result (a last-ball tie can become a win), but never reopens the innings. | `PenaltyAwardedPayload` |
| BR-PN-06 | Penalties are valid while play is suspended, and invalid after `match_ended`. | `validateEvent` |

## 10. Suspension (SU)

| ID | Rule | Carried by |
|---|---|---|
| BR-SU-01 | `play_suspended` (rain, bad light, wet outfield, interval, injury, other, with an optional note) makes the match `paused`. | `SuspensionReason` |
| BR-SU-02 | While paused only `play_resumed`, `overs_revised` (including terminal), `penalty_awarded` and `match_ended` are accepted (`PLAY_SUSPENDED`). Starting a super over needs `play_resumed` first. | `validateEvent` |
| BR-SU-03 | A paused match appears as `live` at fixture level. | `FIXTURE_STATUSES` |

## 11. Results, ties and super overs (RS)

| ID | Rule | Carried by |
|---|---|---|
| BR-RS-01 | Chase won: margin in **wickets** = the chasing team's own threshold − wickets lost (`playersInSide − 1 − w`, or `playersInSide − w` with last man stands), plus balls remaining = allotted − used. | `WinMargin.wickets` |
| BR-RS-02 | Chase lost: margin in **runs** = (target − 1) − chase runs. Chase runs = target − 1 → tie. | `computeNaturalResult` |
| BR-RS-03 | The engine never finalises a result by itself. When a natural result exists it raises `confirm_result`. The match becomes terminal only with `match_ended {natural}`, so a mistaken last ball can be undone before standings change. | `PendingAction.confirm_result` |
| BR-RS-04 | Prompt priority: `confirm_result` / `resolve_tie` > `resume_play` > `start_next_innings` > `select_next_batter` > `select_next_bowler`. A natural result outranks a suspension. | `PendingAction` |
| BR-RS-05 | A tie with `superOver.enabled` (and rounds remaining) offers super over, accept tie, or decide another way. Without super overs it offers accept tie or decide another way. | `resolve_tie.options` |
| BR-RS-06 | Super overs are extra innings of kind `super_over` in the same log. They never change main-innings totals, player aggregates on the match card, or NRR (§21). | `InningsKind`, `MatchSummary.superOvers` |
| BR-RS-07 | By convention the side that batted second in the previous pair bats first in the next super over. It is suggested, not enforced. | `SuperOverStartedPayload` |
| BR-RS-08 | With `restrictRepeatPlayers` (default on), from round 2 a batter dismissed in any earlier super over may not bat, and a bowler of the previous super over may not bowl (`PLAYER_INELIGIBLE_SUPER_OVER`). | `SuperOverRule` |
| BR-RS-09 | A super-over pair with more runs → the tie is decided (`decider.method: 'super_over'`). Tied again: `repeat` → another round is offered; `boundary_count` → more 4s + 6s over the match and all super overs wins (still level → undecided); `tie_stands` → undecided. `maxRounds` caps the rounds (`SUPER_OVER_LIMIT_REACHED`). | `SuperOverTieBreak` |
| BR-RS-10 | A decided tie is stored as `{type: 'tie', decider}`, never as a win, so the main innings stay intact. `resultWinner` returns the decider's winner. | `TieDecider`, `resultWinner` |
| BR-RS-11 | An undecided tie can be decided by bowl-out, coin toss or organizer (`tie_decided`), or accepted as a tie. | `MatchEndOutcome.tie_decided` |
| BR-RS-12 | Walkover: only before any delivery (`WALKOVER_AFTER_PLAY`). It may be the only event. It has no innings. | `MatchEndOutcome.walkover` |
| BR-RS-13 | Awarded: needs a reason. The winner may be null ("awarded as no-winner", treated as no result for points). The margin is optional. | `MatchResult.awarded` |
| BR-RS-14 | No result (declared after play) and abandoned (play called off, possibly with no ball bowled) both carry an optional reason, have no winner, and appear in the NR column. | `MatchResult` |
| BR-RS-15 | Result text: "Pakistan XI won by 3 runs", "Lions won by 5 wickets (12 balls left)", "… (revised target)", "… (par score)", "Match tied", "Match tied — Tigers won the Super Over", "… won on boundary count", "No result", "Match abandoned", "Tigers won by walkover", "Match awarded to Tigers". Singular: "1 run", "1 wicket", "1 ball left". | `formatResult` |

## 12. Match lifecycle (ML)

| ID | Rule | Carried by |
|---|---|---|
| BR-ML-01 | Status (lifecycle) and result (outcome) are separate. Tied, No Result and Walkover are results of a `completed` match. `abandoned` is both a status and a result type. | `MatchStatus`, `MatchResult` |
| BR-ML-02 | `completed` or `abandoned` ⇔ a result exists. `abandoned` status ⇔ `result.type = 'abandoned'`. | DB CHECK |
| BR-ML-03 | While the log is empty, the stored status (`scheduled` / `postponed` / `cancelled`) is authoritative. Once events exist, status is derived by replay. | `deriveMatchStatus` |
| BR-ML-04 | Allowed transitions follow STATE_MACHINES §1. For example, walkover or award without play is allowed from `scheduled` or `postponed`, and reopening is `completed` / `abandoned` → `live` by undoing `match_ended`. | `canTransitionMatch` |
| BR-ML-05 | Nothing can be appended after `match_ended` (`MATCH_ALREADY_ENDED`). | `validateEvent` |
| BR-ML-06 | SAVE & EXIT keeps the status and only hides the match from the startup prompt until the next append. | `resumeDismissedAt` |
| BR-ML-07 | DISCARD deletes only an unfinished **standalone** match. Tournament matches must be ended (abandoned, no result, awarded) instead. | `MatchService.discard` |
| BR-ML-08 | Match edit permissions follow the STATE_MACHINES §1 table: teams are editable only before play; rules, toss and squad removal are restricted once live; completed matches need confirmation for rules and toss and are audited. | `MatchEditPolicy` |
| BR-ML-09 | A match whose log has error-severity replay issues (`needsRepair`) accepts no write that keeps it degraded (append, redo, endMatch, rules edit, projection rebuild). Only a history edit or undo whose result replays cleanly is accepted. | `MatchState.needsRepair`, `FORBIDDEN_STATE` |

## 13. Undo, redo and historical edit (CR)

| ID | Rule | Carried by |
|---|---|---|
| BR-CR-01 | Undo removes the last **action group**: the trailing run of events sharing an `actionId`, such as a wicket and its incoming batter. State is recomputed by replay, never by subtracting. | `undoLastAction`, `truncateFrom` |
| BR-CR-02 | Undo depth is unlimited. | §15 |
| BR-CR-03 | Redo re-appends the identical undone events (same ids, seqs and timestamps) after re-validation, and only if the log still ends where it did (`REDO_STALE`). The redo stack lives only in the session: it is cleared by open, close, a conflict reload, any new action, or a restart. | `redoAction` |
| BR-CR-04 | Undoing `match_ended` reopens the match. For a tournament match this needs a reason and an impact preview, and is audited as `match_reopened`. Redoing a group that contains `match_ended` follows `endMatch` rules. | `MatchService.undo/redo` |
| BR-CR-05 | Historical edit operations: replace, insert before, insert after (seqs refer to the original log). The log is then normalised: (1) over-start bowler selections are re-anchored to the first delivery of their over, (2) seq is renumbered 1..n, keeping ids, with a fresh `actionId` per inserted operation, (3) every delivery is re-stamped, (4) the log is validated and must replay with zero issues. | `applyHistoryEdits`, `normalizeLog` |
| BR-CR-06 | Removing a wicket without removing its `batter_in` fails (`NO_VACANCY`). An over start left without a bowler fails (`BOWLER_NOT_SELECTED`). Surplus selections beyond the innings' overs are dropped and reported. | `EditOutcome` |
| BR-CR-07 | An edit applies only if the log's fingerprint equals the previewed one (`CONFLICT`). | `logFingerprint` |
| BR-CR-08 | Live-match edits are warned. Completed-match edits need confirmation and a reason. Every applied edit (live or completed, standalone or tournament) is audited with the removed and inserted events: `match_history_edited`, or `result_corrected` when standings-relevant data changed. | `AUDIT_ACTIONS`, `summariesAffectStandingsEqually` |
| BR-CR-09 | Live ball-by-ball scoring and plain live undo/redo are not audited. The event log is the record. | `audit.ts` |

## 14. Tournament structure and lifecycle (TS)

| ID | Rule | Carried by |
|---|---|---|
| BR-TS-01 | Tournament states: draft → registration → structure_configured → pools_configured → fixtures_generated → active → completed → archived. Backward steps among setup states are allowed only while no match has started. `completed → active` (reopen) is audited. `completed ⇄ archived`. | `canTransitionTournament` |
| BR-TS-02 | Guards: registration → structure_configured needs ≥ 2 teams and ≥ 1 stage. → pools_configured needs every pool stage's entrants assigned (or knockout seeding done). → fixtures_generated needs confirmed first-stage fixtures. → active happens on the first match start or when the organizer starts it. → completed needs a decided champion or all stages complete, and the organizer's confirmation. | `TournamentGuardContext` |
| BR-TS-03 | Teams are a global library. Tournament membership has status `active`, `withdrawn` or `replaced`. At least 128 teams are supported. | `TournamentTeam` |
| BR-TS-04 | Team seeds are optional integers ≥ 1 (1 = strongest). They drive the `seed` tie-breaker, snake pool seeding, ranking seeding of first-stage knockouts, and `higher_seed` when no slot seed exists. | `TournamentTeam.seed` |
| BR-TS-05 | Stages have a unique 0-based `orderIndex`. Every slot source references a stage with a **lower** order index. Parallel stages (Cup and Plate) get consecutive indexes and depend only through slot sources. | `Stage.orderIndex` |
| BR-TS-06 | Stage types: `league` (one pool), `group` (several pools), `knockout` (bracket, no table), `custom` (manual fixtures; a table only if it has pools). | `StageType` |
| BR-TS-07 | Exactly one stage per tournament has `decidesChampion`. The wizard sets it on the last stage of the main chain. A Plate stage ordered last never produces the champion. | `StageConfig.decidesChampion` |
| BR-TS-08 | Stage points, tie-breakers, NRR config and match rules inherit from the tournament unless overridden. | `EffectiveStageRules` |
| BR-TS-09 | A stage's entrants are its entry slots (direct entries included). A stage without entry rules takes the active teams that are not directly entered elsewhere, which is normally the first stage. | `stageEntrants` |
| BR-TS-10 | Stage states: pending → active → completed, and completed → active when a result is corrected or reopened. | `canTransitionStage` |
| BR-TS-11 | Templates hold structure only (no teams, ids or results). Every template has exactly one `decidesChampion` stage. `templateFromSnapshot` must always produce a template that can be instantiated. | `TournamentTemplate` |

## 15. Pools (PL)

| ID | Rule | Carried by |
|---|---|---|
| BR-PL-01 | A pool member is a team **or** a slot. A member appears in at most one pool per stage. | `PoolEntry`, DB UNIQUE |
| BR-PL-02 | Pools are named "Pool A", "Pool B", …, "Pool Z", "Pool AA", … | `poolName` |
| BR-PL-03 | The default split is near-even with larger pools first (10 teams in 3 pools → 4/3/3). Explicit uneven sizes are allowed. | `distributePoolSizes` |
| BR-PL-04 | Random assignment uses a stored seed (typed by the organizer, e.g. 847291, or generated). The same seed and input always give the same pools. Text seeds are hashed (FNV-1a). | `assignRandom`, `normalizeSeed`, `StageConfig.seedingSeed` |
| BR-PL-05 | Seeded assignment deals teams by seed in a snake (A, B, C, D, D, C, B, A…). Unseeded teams come last, by name. | `assignSeeded` |
| BR-PL-06 | Pools built from qualifiers deal entry slots in snake order or a fixed per-pool list (e.g. Super 8 Group 1 = A1, B2, C1, D2). | `assignSlotsToPools` |
| BR-PL-07 | An existing arrangement is never replaced silently. "Current pool arrangement will be replaced." is shown, the previous arrangement is kept for undo, and an impact preview is shown when fixtures exist. | §31, §34 |
| BR-PL-08 | Warnings: uneven pools ("Teams in different pools may play different numbers of matches."), empty pool, single-team pool, duplicate member, an entrant left unassigned. Direct entrants to later stages are not "unassigned" in stage 1. | `poolWarnings` |
| BR-PL-09 | Legs per pool default to the stage's legs. A pool may override them (e.g. 3-team pools play double round robin). | `Pool.legs` |

## 16. Fixtures (FX)

| ID | Rule | Carried by |
|---|---|---|
| BR-FX-01 | Round robin (circle method): n entrants → n − 1 rounds per leg (n even) or n rounds with one bye each (n odd). Every pair meets exactly once per leg. No team plays twice in a round. Leg k+1 mirrors leg k with sides swapped. Side A appearances are balanced within 1. | `roundRobin` |
| BR-FX-02 | Generation produces drafts only. Nothing is saved until the organizer confirms (§36). Regeneration replaces only fixtures without a match. | `FixtureDraft`, `fixtures_replace` |
| BR-FX-03 | Draft validation errors (block): same side twice, a side not in the pool or tournament. Warnings: duplicate encounter beyond the pool's legs, a team with two fixtures at the same date and time, dates outside the tournament window. | `validateFixtureDrafts` |
| BR-FX-04 | Match numbers run 1-based across the whole tournament. New fixtures continue the numbering. | `Fixture.matchNumber` |
| BR-FX-05 | Scheduling states (`scheduled`, `postponed`, `rescheduled`, `cancelled`) are owned by the fixture and changed only by the organizer. `live`, `completed` and `abandoned` mirror the fixture's current match and are written in the same transaction as the match change. | `FixturePatch.status` |
| BR-FX-06 | Cancelled fixtures score nothing and are not "played". They can be restored to `scheduled` (audited). | `canTransitionFixture` |
| BR-FX-07 | Sides freeze when a fixture's match starts: from then on the fixture's teams are the match's teams (`matchSides`), and slots are never re-resolved for it. | `Fixture.matchSides`, `resolveFixtureTeams` |
| BR-FX-08 | An abandoned fixture may be rescheduled for a replay only when `StageConfig.abandonedMatches = 'replay'` (or `KnockoutConfig.noResult = 'replay'`). The fixture's current match is cleared in the same transaction, so the abandoned result stops counting. The old match keeps its link for history. | `replayAllowed` |
| BR-FX-09 | Fixture edits follow STATE_MACHINES §5. Nothing can be edited while live. When completed, only stage or pool can change (with confirmation). A fixture with a match can't be deleted until the match is dealt with. | Fixture edit policy |
| BR-FX-10 | Starting a fixture's match uses the fixture, then stage, then tournament format and rules. If the knockout policy is `tiedMatch: 'super_over'`, super overs are forced on. | `startFixtureMatch` |

## 17. Points (PT)

| ID | Rule | Carried by |
|---|---|---|
| BR-PT-01 | Points are configured per tournament (and optionally per stage): win, tie, no result, loss, abandoned, walkover win and walkover loss. Integers, which may be negative. Default 2/1/1/0. | `PointsSystem`, `DEFAULT_POINTS_SYSTEM` |
| BR-PT-02 | `abandoned: null` → same as no result. `walkoverWin/Loss: null` → same as win/loss. | `PointsSystem` |
| BR-PT-03 | Result mapping: win or awarded-with-winner → W/L. Tie → T. No result, abandoned, awarded-without-winner → NR. Walkover → W/L with walkover points. Cancelled → nothing. | `computeStandings` |
| BR-PT-04 | A decided tie (super over, boundary count, organizer): `superOverDecidedTie: 'win_loss'` (default, ICC) counts it as W/L. `'tie'` gives both teams tie points, and the decider matters only for knockout advancement. | `PointsSystem.superOverDecidedTie` |
| BR-PT-05 | Optional bonus: the winner earns `points` extra when its run rate ≥ `ratio` × the loser's. | `BonusPointRule` |
| BR-PT-06 | Played (P) = completed + no result + abandoned + walkover + awarded. Cancelled never counts. | `StandingRow.played` |
| BR-PT-07 | Row points = result points + bonus + active points-adjustment overrides. | `StandingRow.points` |
| BR-PT-08 | Only a fixture's **current** match counts. A replaced abandoned match stops counting when the fixture is rescheduled. | `Fixture.matchId` |

## 18. Net run rate (NR)

| ID | Rule | Carried by |
|---|---|---|
| BR-NR-01 | NRR = (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled). Overs = balls ÷ that match's balls per over, so mixed formats work. NRR is null when either overs total is 0. | `computeNrr` |
| BR-NR-02 | NRR is computed only in `tournament/nrr.ts`, from `MatchSummary`, never from events and never anywhere else. | §41 |
| BR-NR-03 | `icc` mode: a side bowled out (all out or batters unavailable) counts its **full allotted balls** (after revision) as faced, and the opponent the same as bowled. A chase won early counts the actual balls. | `NrrMode` |
| BR-NR-04 | `actual_overs` mode: always actual legal balls. | `NrrMode` |
| BR-NR-05 | Revised target, `icc_par`: the side batting first is credited with (target − 1) runs off the chasing side's allotted balls. The chasing side is unaffected. This applies to terminated par-score chases too. `actual`: raw figures. | `NrrConfig.revisedTarget` |
| BR-NR-06 | Excluded by default: no result, abandoned, walkover, awarded. With `includeNoResult` / `includeAbandoned`, every innings with ≥ 1 legal ball counts (the all-out rule still applies). Walkover can use notional figures. Awarded may use the innings that were played. | `NrrConfig`, `WalkoverNrrPolicy` |
| BR-NR-07 | Super-over runs and balls never count. | `MatchSummary.superOvers` |
| BR-NR-08 | Expunged teams' matches are excluded for both teams. | `matchNrrContributions` |
| BR-NR-09 | NRR values are compared with an epsilon of 1e-9. Displayed to 3 decimal places with an explicit sign ("+1.234", "-0.567", "0.000"). | `NRR_EPSILON`, `formatNrr` |
| BR-NR-10 | Default: ICC mode, NR, abandoned, walkover and awarded excluded, revised target `icc_par`. | `DEFAULT_NRR_CONFIG` |

## 19. Tie-breakers (TB)

| ID | Rule | Carried by |
|---|---|---|
| BR-TB-01 | Ranking uses the configured ordered chain from: points, nrr, head_to_head, head_to_head_wins, head_to_head_nrr, wins, fewer_losses, runs_scored, wickets_taken, seed, organizer_decision, draw_lots. Nothing assumes "Points → NRR". | `TIE_BREAKER_KINDS` |
| BR-TB-02 | Default chain: Points → NRR → Head-to-Head → Most wins → Organizer decision. | `DEFAULT_TIE_BREAKERS` |
| BR-TB-03 | **Sequential, no restart:** sort by the first criterion. Each group still level is split by the *next* criterion, computed among that group only. When one team is separated from a three-way tie, the remaining two go on to the next criterion; they do not go back to head-to-head between the two. | `rankTeams` |
| BR-TB-04 | Head-to-head is a mini-league of the level teams' mutual matches (points, wins, or NRR over those matches only). If a mutual match has no result or hasn't been played, the teams stay level on that criterion. With `headToHeadRequiresCompleteMiniLeague`, head-to-head criteria are skipped unless every pair of level teams has a counted result. | `HeadToHeadRecord`, `RankContext` |
| BR-TB-05 | `seed`: the lower seed number ranks first. Unseeded teams stay level on this criterion. | `TeamRecord.seed` |
| BR-TB-06 | `organizer_decision` / `draw_lots` apply only an active `tie_resolution` override covering exactly that level group. Without one, the teams share the position. Draw of lots is done in the app with a recorded seed, never with hidden randomness. | `TournamentOverride.tie_resolution` |
| BR-TB-07 | Still-level teams are shown in input order, never alphabetically (that would look like a decision). They share the position (`sharedPosition`). | `rankTeams` |
| BR-TB-08 | A level group is **unresolved** (needs a decision now) only when the table is complete or the tie is mathematically final, **and** it straddles a slot boundary of a downstream stage. Otherwise it is provisional with no call to action. | `StandingsTable.unresolvedTies/provisionalTies` |
| BR-TB-09 | Every row level on points with the row below carries an explanation: "Ahead of Lions on net run rate (+0.512 vs +0.231)" or "Level with Lions — organizer decision required". | `TieBreakNote` |

## 20. Qualification and slots (QL)

| ID | Rule | Carried by |
|---|---|---|
| BR-QL-01 | Qualification is never hard-coded. Entry rules are stored on the **target** stage and expanded into concrete slots. The slots, not the rules, are authoritative. | `StageConfig.entryRules`, `expandEntryRules` |
| BR-QL-02 | Rule kinds: `top_per_pool` (positions `fromPosition`..+count−1 of every pool), `pool_position`, `best_of_position` (rank among all pools' teams at a position), `top_overall`, `knockout_winners`, `manual` (organizer picks), `direct_entry` (named teams). | `QualificationRule` |
| BR-QL-03 | Expansion order and labels: top 2 over A, B → A1, B1, A2, B2. Best-of → "Best runner-up", "2nd best runner-up". Top overall → "1st overall". Bracket → "Winner SF1". Indexes are contiguous from 0 in rule order. | `defaultSlotLabel` |
| BR-QL-04 | Re-expansion (source pools changed, re-draw) keeps slot ids **by index**, so pool entries, fixtures and overrides that reference them stay valid. Surplus slots are removed. | `expandEntryRules(existing)` |
| BR-QL-05 | Slot roles: `entry` slots define entrants, and a team may occupy only **one entry slot per stage**: later entry slots skip teams already placed, with an explanation. `progression` slots (knockout inside the stage, e.g. "Winner SF1") are exempt. | `StageSlot.role` |
| BR-QL-06 | Rows of withdrawn or replaced members (`membership ≠ active`) never occupy a slot. The next eligible team moves up. | `StandingRow.membership` |
| BR-QL-07 | Slot status: `final` when the source is decided (pool or stage complete, position mathematically locked, fixture terminal, manual); `provisional` from the current table; `pending` when unknown. | `SlotResolution` |
| BR-QL-08 | Uneven-pool normalisation for cross-pool sources: `raw` (raw figures); `per_match_average` (points per match played, then the stage's tie-breakers); `drop_extra_results` (in larger pools, results against the lowest-placed teams are discarded until every compared team has played the same number, then raw comparison). | `UnevenPoolNormalization` |
| BR-QL-09 | Qualification is reported per **downstream stage**, for example Cup and Plate separately. The summary status is the lowest-order target in which the team is qualified, else in contention, else the first target. | `TeamQualification.targets` |
| BR-QL-10 | Certainty: `mathematical` = true for every possible outcome of the remaining fixtures (or the stage is complete); `provisional` = current table only; `manual` = decided by an override. | `TeamQualification.certainty` |
| BR-QL-11 | Exact enumeration is used when ≤ 8 fixtures are undecided (default `enumerationLimit`). Each fixture's outcome set comes from its points system (wins, bonus, tie, decided tie, NR, abandoned, walkovers). Level-on-points situations are treated pessimistically. Above the limit, conservative bounds are used, so certainty is never wrongly claimed. | `QualificationOptions` |
| BR-QL-12 | Every status carries a §98 explanation, e.g. "Tigers have mathematically qualified for the Semifinal as Pool A winners (Top 2 from each pool; Points → NRR → Head-to-Head)." | `TeamQualification.explanation` |

## 21. Knockouts and champion (KO)

| ID | Rule | Carried by |
|---|---|---|
| BR-KO-01 | The bracket size P is the next power of two ≥ n entrants. The top P − n seeds get byes into round 2. Round 1 follows standard bracket order (8: 1, 8, 4, 5, 2, 7, 3, 6), so seeds 1 and 2 can meet only in the final. | `knockoutBracket`, `standardBracketOrder` |
| BR-KO-02 | Round names: Final, Semifinal, Quarterfinal, Round of 16, Round of 32, else "Round k". The play-off is "Third place". | `roundName` |
| BR-KO-03 | Later-round sides are progression slots sourced by **bracket position** (`bracket_winner` / `bracket_loser` of round and position), never by fixture id, so a re-draw keeps them valid. `fixture_winner` / `fixture_loser` are only for hand-built custom stages (page play-offs). | `SlotSource` |
| BR-KO-04 | `KnockoutConfig.rounds` stops the bracket early (e.g. a QF-only stage feeding a separate SF stage). Otherwise the last round's single main fixture is the final (`isFinal`). | `KnockoutConfig.rounds` |
| BR-KO-05 | The third-place play-off (optional) is fed by the semifinal losers. It is never a source for `knockout_winners` and never decides the champion. | `BracketPosition.kind 'third_place'` |
| BR-KO-06 | Seeding: `fixed` gives cross-pool pairings (2 pools: A1 v B2, B1 v A2; 4 pools: A1 v B2, C1 v D2, B1 v A2, D1 v C2), with entrants without a pool position seeded after them by slot index. `random` is a seeded shuffle. `ranking` uses the source-stage record (normalised across uneven pools) or the pre-tournament seed. | `seedEntrants` |
| BR-KO-07 | Ranking seeding can't be generated until every entry slot is `final` ("Seeding by ranking is possible once all 8 qualifiers are known."). Fixed and random can use unresolved slots. | `knockoutGenerationGuard` |
| BR-KO-08 | Advancement: a win, walkover or award with a winner → that team. A decided tie → the decider's winner. An undecided tie → `tiedMatch` (`higher_seed`; `organizer`; `super_over` still tied → organizer decision required). No result or abandoned → `noResult` (`higher_seed`; `replay` / `organizer` → organizer decision required; `shared` → both, meaningful only in a champion-deciding final). | `knockoutAdvancer` |
| BR-KO-09 | `higher_seed` uses the entry slot's seed in this stage, else the pre-tournament seed. If a seed is unknown, `higher_seed` never picks a winner; an organizer decision is required. | `knockoutAdvancer.seedOf` |
| BR-KO-10 | A `slot_assignment` override on a winner slot always takes precedence over automatic advancement. | `resolveStageSlots` |
| BR-KO-11 | The champion comes from the `decidesChampion` stage: a `champion` override takes precedence (`manual`, or `shared` with several teams); knockout or custom: the winner of the `isFinal` fixture; a washed-out final with `noResult: 'shared'` → joint champions; league or single-pool group: top of the complete table. Otherwise there is no champion yet. | `resolveChampion`, `ChampionResult` |
| BR-KO-12 | At most one fixture per stage is `isFinal`. | DB unique partial index |
| BR-KO-13 | Defaults for knockout stages: no third place, play to one winner, tie → super over, no result → higher seed. Custom stages without a knockout config use the same defaults. | `DEFAULT_KNOCKOUT_CONFIG` |

## 22. Manual overrides (OV)

| ID | Rule | Carried by |
|---|---|---|
| BR-OV-01 | Override kinds: qualification (qualify into a slot, displacing the automatic occupant / eliminate from automatic slots / reassign to a slot or pool), points adjustment (±), tie resolution, slot assignment, expunge results, champion. | `TournamentOverride` |
| BR-OV-02 | Every override needs a non-empty reason. It is shown with a **"Manual Override"** badge and audited (`override_applied`). | `OverrideBase.reason` |
| BR-OV-03 | Overrides are revoked (`revokedAt`, `revokeReason`), never deleted. Only active overrides apply. | `override_revoke` |
| BR-OV-04 | Overrides are layered on top of automatic results. Computed data is never edited. Revoking restores the automatic result. | D11 |
| BR-OV-05 | If a referenced stage, pool or slot is later deleted, the override keeps its ids in its stored payload for history, and its indexed references become null, so an old override never blocks a re-expansion. | DB `ON DELETE SET NULL` |
| BR-OV-06 | Applying or revoking an override checks the tournament version (preview == apply). | `applyOverride(…, version)` |

## 23. Change control, impact and audit (CC)

| ID | Rule | Carried by |
|---|---|---|
| BR-CC-01 | Edit permission levels: **allowed** (apply directly; audited once the tournament is active); **warn** (impact preview, one tap); **confirm** (impact preview, explicit confirmation and a reason; audited); **forbidden** (explained, with what to do instead). | `EditPermission` |
| BR-CC-02 | The permission for each tournament state and change area follows the STATE_MACHINES §3 matrix. Before any match: broad changes are allowed. Matches started, none completed: structural changes warn. Completed matches exist: anything touching pools, played fixtures, rules, qualification, NRR or results needs confirmation, and team removal becomes withdrawal. Completed tournament: only info is allowed; rules, results and overrides need confirmation; structure is forbidden. Archived: everything is forbidden until unarchived. | `tournamentEditPolicy` |
| BR-CC-03 | Every `warn` or `confirm` change is previewed (WHAT WILL CHANGE: fixtures, standings, qualification, slots, NRR, completed matches affected, severity) before it is applied. | `computeImpact`, `ImpactSummary` |
| BR-CC-04 | **Preview == apply:** the domain turns a change into a `ChangePlan`. The preview evaluates exactly that plan, and the service persists exactly that plan only if the tournament version is unchanged (`CONFLICT` otherwise). | `planChange`, `TournamentSnapshot.version` |
| BR-CC-05 | Impact severity: `destructive` if started or completed match data would be detached, removed or re-attributed; `warning` if standings, NRR, qualification or slots change; `info` for scheduling only; `none` otherwise. `blocked` when the policy forbids it. | `ImpactSeverity` |
| BR-CC-06 | **Move** (§33): the member's unplayed fixtures in the source pool are deleted and fixtures against every member of the target pool are created (with that pool's legs). Played fixtures keep their teams and pool. | `pool_move` |
| BR-CC-07 | **Swap**: the members exchange pools and each other's unplayed fixtures. Played fixtures are kept. | `pool_swap` |
| BR-CC-08 | **Replace** X → Y: Y takes X's pool entries and unplayed fixtures, and X becomes `replaced`. X's played results: `transfer_to_replacement` (Y's row aggregates them; opponents keep theirs), `keep_for_opponents` (X stays as a non-qualifying row, and Y starts at zero), or `expunge` (an `expunge_results` override removes every result involving X). | `team_replace.priorResults` |
| BR-CC-09 | **Withdraw**: membership becomes `withdrawn`. Remaining fixtures become real matches with a `match_ended {walkover}` event for the opponent, or are cancelled. Results can optionally be expunged. | `team_withdraw` |
| BR-CC-10 | **Slot conflicts:** when a correction changes who occupies a slot through which a fixture was already played, the played fixture is never rewritten (frozen sides). The organizer either accepts (results stand as played) or pins the old occupant with a `slot_assignment` override. Both are audited. | `SlotChange.playedFixtureIds` |
| BR-CC-11 | Stage edits after play has started apply only to **future** stages. Upserting a stage re-expands dependent stages' entry slots in the same transaction. | `stage_upsert` |
| BR-CC-12 | Every structural or historical change writes one append-only audit entry in the **same transaction**: action, entity, summary, previous and new value, reason, confirmed impact, time. | `AuditEvent` |
| BR-CC-13 | Deleting a tournament is allowed (with the typed name) while no match has started. Afterwards it needs the typed name and an explicit opt-in to delete completed matches, and the service deletes matches explicitly (matches → tournament is RESTRICT). It is forbidden while archived. | `tournamentEditPolicy.deleteTournament` |
| BR-CC-14 | Every transaction that writes a tournament, a fixture mirror or a tournament match summary increments `tournaments.revision` and refreshes the champion projection when the champion can change. | `TournamentRepository.bumpRevision` |

## 24. Data and backup (DB)

| ID | Rule | Carried by |
|---|---|---|
| BR-DB-01 | Backups contain authoritative data only. Projections are rebuilt by replay on import, so a corrupt projection can never be imported. | `BackupData` |
| BR-DB-02 | The envelope carries `format`, `formatVersion`, `schemaVersion`, `exportId`, scope, counts and a SHA-256 checksum of the canonical JSON (sorted keys). | `BackupEnvelope` |
| BR-DB-03 | Import is refused when there is a structural error, an unsupported format version, a schema newer than the app, a checksum mismatch, duplicate ids, an unresolved reference (including a player id inside an event payload), or a match log with an error-severity replay issue. A missing checksum is a warning. | `BACKUP_ISSUE_CODES` |
| BR-DB-04 | Conflicts are detected per **aggregate** (a tournament with everything in it; a standalone match; library team, player, venue, template, preset), never per row. | `ImportAggregateKind` |
| BR-DB-05 | `skip_existing`: conflicting aggregates are skipped entirely (never merged), and existing library rows are reused. `import_as_copy`: every id is remapped and new aggregates are inserted. `replace_existing`: each conflicting aggregate is deleted explicitly after listing the local-only data that will be lost, then inserted from the file. Library rows are updated in place. `INSERT OR REPLACE` is never used. | `ImportConflictPolicy` |
| BR-DB-06 | A re-import of the same `exportId` is recognised and reported ("already imported on …"). | `ImportPreview.previouslyImportedAt` |
| BR-DB-07 | Logos are not embedded and are cleared on import unless the file exists. Settings are never applied automatically. | `backup.ts` |
| BR-DB-08 | An import is one transaction. Circular references are checked at commit. `foreign_key_check` must be empty afterwards. It is audited as `backup_imported`. | DATABASE §6 |
| BR-DB-09 | Teams, players and venues that are in use are archived, not deleted. Archived items are hidden from pickers but keep their history. | `archivedAt` |
| BR-DB-10 | Renaming a team or player changes their name everywhere, including past scorecards (names are resolved at load time, not copied). | `MatchPlayer.name` |
