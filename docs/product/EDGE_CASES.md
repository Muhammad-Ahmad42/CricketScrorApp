# Scorebook — Edge Cases

§102 product item 7, §4 phase 2, §93. This is an exhaustive catalogue of scoring, tournament and data edge cases and how the product should behave in each.

* Rules cited as `BR-…` are in [BUSINESS_RULES.md](BUSINESS_RULES.md). Codes are `EventValidationCode`, `EventWarningCode` or `ServiceErrorCode` from the contract.
* The last column names the work package whose acceptance tests should cover the case: SE = scoring engine, TS = tournament structure, TST = tournament standings, DB = db, SV = services/stores, EX = export, UI = match/tournament UI.
* **⚠ Gap** marks a case the frozen contract does not fully specify. The behaviour given there is the product recommendation, and each gap is listed again in §14.

---

## 1. Deliveries, runs and extras

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-D-01 | Batters run 1, and the throw goes for 4 overthrows | 5 runs to the batter (`runsRun: 1, boundary: 4`). Strike changes (1 crossing). Not counted in the batter's 4s. No `UNUSUAL_RUNS` warning. | BR-DR-05, BR-SF-01 | SE |
| EC-D-02 | All-run four (no boundary) | `scoreRuns(4, {allRun: true})` → `runsRun: 4`. 4 runs, no change of ends, not a "4" | BR-DR-05 | SE |
| EC-D-03 | Ran 2, one run short | 1 run scored. Batters stay at their original ends (2 crossings). Token `1s`, label "One run, one short" | BR-DR-03, BR-SF-01 | SE |
| EC-D-04 | Ran 3, one short | 2 runs scored, and the batters change ends (3 crossings) | BR-SF-01 | SE |
| EC-D-05 | `shortRuns` > `runsRun` | Rejected: `INVALID_SHORT_RUNS` | BR-DR-02 | SE |
| EC-D-06 | Wide that goes to the boundary | 5 wides (penalty 1 + 4). Charged to the bowler. Not a ball faced. Re-bowled unless `countsAsBall`. Token `WD+4` | BR-DR-09 | SE |
| EC-D-07 | Wide, batters run 2 | `wd 3`. Batters stay at their ends (even). Bowler charged 3 | BR-DR-09 | SE |
| EC-D-08 | Wide penalty set to 0 (gully) and a plain wide | 0 runs, but the delivery is still a wide: re-bowled and shown as `WD` | `WideRule.penaltyRuns` | SE |
| EC-D-09 | `wide.countsAsBall: true` on the 6th ball | It completes the over (legal), the batters swap ends, the bowler prompt appears, and the striker's balls faced do not change | BR-DR-07, BR-DR-08 | SE |
| EC-D-10 | No-ball hit for six | nb 1 + 6 to the batter (counted as a six). Bowler charged 7. Ball faced. Next ball is a free hit | BR-DR-10, BR-SF-07 | SE |
| EC-D-11 | No-ball, batters run 2 byes | `nb 1, b 2`. Bowler charged 1. Striker faced a ball and scored 0. No change of ends. Token `NB+2B` | BR-DR-10 | SE |
| EC-D-12 | No-ball + 1 leg-bye | `nb 1, lb 1`. Bowler charged 1. Batters change ends | BR-DR-10 | SE |
| EC-D-13 | No-ball + 1 run + 4 overthrows off the bat | nb 1 + 5 to the batter. Strike changes. Not a "4" | BR-DR-05, BR-DR-10 | SE |
| EC-D-14 | 6 recorded off a bye or leg-bye | Rejected: `SIX_NOT_OFF_BAT` | BR-DR-04 | SE |
| EC-D-15 | Leg-bye 4 on a fair ball | 4 leg-byes. Not charged to the bowler. Counts as a dot ball for the bowler. No change of ends | BR-DR-11 | SE |
| EC-D-16 | Bye off the last ball of a maiden-in-progress over | The over is still a maiden (byes don't break it) | BR-DR-15 | SE |
| EC-D-17 | A wide in an otherwise run-less over | Not a maiden | BR-DR-15 | SE |
| EC-D-18 | 7 runs run, no boundary (lost ball) | Accepted with the warning `UNUSUAL_RUNS` ("7 runs without a boundary — is that right?") | BR-DR-06 | SE |
| EC-D-19 | 10 runs run | Rejected: `INVALID_RUNS` (0–9) | BR-DR-02 | SE |
| EC-D-20 | A no-ball on the last scheduled ball (`countsAsBall: false`) | Not legal. The over continues. One more ball is due, and it is a free hit | BR-DR-07 | SE |
| EC-D-21 | 8-ball overs | Numbering 0.1–0.8. `formatOvers(10, 8)` = "1.2". Economy and NRR use balls ÷ 8 | BR-DR-17 | SE |
| EC-D-22 | 1 ball per over (novelty format) | Every legal ball ends an over. The consecutive-overs rule means bowlers must alternate | BR-MC-02, BR-BW-06 | SE |
| EC-D-23 | Wide bowled after 2 legal balls | Labelled "x.3". The next legal ball is also "x.3". `deliveryInOver` increments for both | BR-DR-14 | SE |

## 2. Strike, free hit and bowling

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-SB-01 | Single off the last ball of the over | Batters cross (odd run), then swap for the new over, so the same batter faces again | BR-SF-02, BR-SF-03 | SE |
| EC-SB-02 | Scorer notices the wrong batter is on strike | Swap Strike between deliveries (`strike_swapped`). It can be undone. It is not audited on its own | BR-SF-04 | SE |
| EC-SB-03 | Free hit, and the free-hit ball is a wide | The free hit carries over to the next delivery | BR-SF-07 | SE |
| EC-SB-04 | Striker bowled on a free hit | Rejected: `DISMISSAL_NOT_ALLOWED_ON_FREE_HIT`. The sheet hides Bowled, Caught, LBW, Stumped and Hit Wicket | BR-SF-08 | SE, UI |
| EC-SB-05 | Run out on a free hit | Allowed | BR-SF-08 | SE |
| EC-SB-06 | `noBall.freeHit: false` | No free hit after a no-ball | FR-M-05 | SE |
| EC-SB-07 | Same bowler selected for a second consecutive over | Shown as ineligible (`bowled_previous_over`). Recording it fails with `BOWLER_CONSECUTIVE_OVERS` unless `allowBowlerConsecutiveOvers` | BR-BW-06 | SE |
| EC-SB-08 | Bowler injured after 3 balls | Replacement with reason `injury`. Both bowlers are listed in the over. Neither may bowl the next over. No maiden possible. The injured bowler may bowl later | BR-BW-03, BR-BW-05 | SE |
| EC-SB-09 | Bowler removed from the attack (Law 41) mid-over | Reason `suspended` → `removed_from_attack` for the rest of the innings (`BOWLER_REMOVED_FROM_ATTACK` if selected again) | BR-BW-03 | SE |
| EC-SB-10 | Wrong bowler noticed after 2 balls of the over | Not a new event. Correct it with a history edit of the over-start selection, which re-stamps the over's deliveries | BR-BW-04 | SE, UI |
| EC-SB-11 | `injury` reason chosen before the first ball of the over | Rejected: `BOWLER_CHANGE_REASON_INVALID` (just re-select with `over_start`) | BR-BW-02 | SE |
| EC-SB-12 | Fielding side has only 4 non-substitute players who can bowl, 20 overs, quota 4 (16 overs possible). The 17th over is due | Setup had warned `BOWLER_QUOTA_TOO_LOW`. Now the prompt lists everyone as `quota_reached` and the warning `SQUAD_EXHAUSTED` is raised. The organizer adds a player, or raises the quota with a rules edit (confirmation, and the log must still replay). Never a dead end | BR-MC-09, BR-BW-07 | SE, UI |
| EC-SB-13 | `icc_one_fifth` with 17 overs | Each bowler gets 3 overs. The first two bowlers to start a 4th over use the 2 extra slots, and a third bowler at 3 overs is `quota_reached` | BR-MC-07 | SE |
| EC-SB-14 | `icc_one_fifth` and the overs are revised from 20 to 13 mid-innings | Quota becomes 2 each, and 3 bowlers may bowl a 3rd. A bowler who has already bowled 4 simply can't bowl again | BR-MC-07, BR-RV-04 | SE |
| EC-SB-15 | Substitute fielder chosen as bowler | Never offered. Recording it fails with `SUBSTITUTE_NOT_ALLOWED` | BR-MC-11 | SE |
| EC-SB-16 | Last-man-stands lone batter scores 1 | They keep strike. At the end of the over there's no swap, and they face the next over | BR-SF-05 | SE |

## 3. Wickets and dismissals

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-W-01 | **Stumped off a wide** | 1 wide (penalty) is scored. The ball is not legal (re-bowled) and not a ball faced. The striker is out, and the bowler is credited with the wicket and charged the wide. The fielder defaults to the designated keeper. The incoming batter takes the striker's end. Token `WD+W` | BR-DS-01, BR-DS-02, BR-DS-08 | SE |
| EC-W-02 | Stumped off a wide that is also a free hit | Rejected: only run out, hit twice, obstructing and handled are possible on a free hit | BR-SF-08 | SE |
| EC-W-03 | **Run out off a no-ball**: the batters complete 1 off the bat, and the non-striker is run out going for the 2nd at the striker's end | nb 1 + 1 run to the batter. Striker faced 1 ball. The runner is out, not credited to the bowler. The not-out batter is at the other end, and the incoming batter takes the striker's end. The next ball is a free hit. Token `NB+1+W` | BR-DS-03, BR-DS-04, BR-DS-06, BR-SF-07 | SE |
| EC-W-04 | Caught off a no-ball | Rejected: `DISMISSAL_NOT_ALLOWED_ON_CALL` | BR-DS-01 | SE |
| EC-W-05 | Caught off the last ball of the over | New batter goes to the non-striker's end (the vacancy swaps at the over end). The not-out batter faces the next over | BR-DS-05, BR-SF-03 | SE |
| EC-W-06 | Caught mid-over | The new batter faces the next ball (Law 18.11), even if the batters crossed | BR-DS-05 | SE |
| EC-W-07 | Caught and bowled | Fielder = bowler. Text "c & b Hassan" | BR-DS-07 | SE |
| EC-W-08 | Catcher not recorded | Accepted with `FIELDER_UNKNOWN`. Text "c ? b Hassan". No catch credited to anyone | BR-DS-08 | SE |
| EC-W-09 | Catch by a substitute fielder | "c sub (Ali) b Hassan". The substitute gets no batting row. The substitute can't then be removed from the squad | BR-MC-11, BR-MC-14 | SE, DB |
| EC-W-10 | Run out with runs recorded but no dismissal end | Rejected: `DISMISSAL_END_REQUIRED` | BR-DS-03 | SE |
| EC-W-11 | Bowled with runs recorded | Rejected: `RUNS_NOT_ALLOWED_WITH_DISMISSAL` | BR-DS-02 | SE |
| EC-W-12 | Non-striker run out backing up before the ball is bowled | Off-ball `batter_dismissed {run_out}`. No ball counted. No bowler credit. A vacancy opens at the non-striker's end | BR-DS-09 | SE |
| EC-W-13 | Incoming batter timed out | `batter_dismissed {timed_out}` names the incoming batter. It is a wicket. The vacancy stays open for the next batter | BR-DS-09 | SE |
| EC-W-14 | Wicket that would be the last one, with last man stands off | Innings all out at `playersInSide − 1` wickets. No incoming-batter prompt | BR-MC-04 | SE |
| EC-W-15 | **Wicket after the winning run (Law 16.6)**: need 1, one run completed, and the non-striker is run out going for the 2nd | Rejected: `WICKET_AFTER_RESULT`. The scorer records 1 run without the wicket. Result "won by N wickets" with the wickets in hand before that ball | BR-DS-11 | SE |
| EC-W-16 | Need 1 and a wide is bowled, with a stumping attempted on it | The wide penalty alone reaches the target, so the stumping is rejected (`WICKET_AFTER_RESULT`) | BR-DS-11 | SE |
| EC-W-17 | Scores level on the last ball, and a batter is run out going for the winning run | The wicket counts. The chase ends level → tie (or all out if it was the last wicket; still a tie on runs) | BR-DS-11, BR-RS-02 | SE |
| EC-W-18 | Retired out | Counts as a wicket, appears in the fall of wickets, and the batter can never return | BR-DS-10 | SE |
| EC-W-19 | Handled the ball (clubs on pre-2017 Laws) | Allowed like obstructing (needs a dismissal end). Not credited to the bowler | DELIVERY_DISMISSAL_TYPES | SE |

## 4. Batters, retirements and short sides

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-B-01 | **Retired hurt, returns later** | Retirement opens a vacancy (not a wicket, not in the fall of wickets). The partnership ends (`retirement`) and a new one starts with the same wicket number. At the next vacancy the batter is offered after the yet-to-bat batters. When they return, their score continues and `returnedFromRetirement` is set | BR-BT-02, BR-BT-03, BR-BT-06 | SE |
| EC-B-02 | Retired hurt, and no one else is left to bat at the fall of the next wicket | The retired-hurt batter is offered. If they can't bat, "End innings (no batters available)" records `batters_unavailable` (counts as all out) | BR-BT-07 | SE |
| EC-B-03 | Retired-not-out batter wants to return while yet-to-bat batters remain | Not eligible (`BATTER_NOT_ELIGIBLE`). Eligible only once no yet-to-bat batter remains, and under mandatory retirement only if `mayReturn` | BR-BT-02, BR-BT-05 | SE |
| EC-B-04 | Mandatory retirement at 20, and the batter reaches 23 with a four mid-over, `timing: 'end_of_over'` | The banner appears only when the over ends. Scoring is never blocked. If ignored, the batter just carries on | BR-BT-05 | SE, UI |
| EC-B-05 | Mandatory retirement when every remaining batter has already batted | No banner (`retirementsDue` is empty) | BR-BT-05 | SE |
| EC-B-06 | **Last man standing** (11-a-side, `lastManStands`) | At 10 wickets the survivor bats alone (`nonStrikerId` null), keeps strike on odd runs and at over ends, and can be run out at either end. The 11th wicket = all out. A chase won with 1 wicket left shows "won by 1 wicket" (11 − 10) | BR-MC-04, BR-SF-05, BR-RS-01 | SE |
| EC-B-07 | Uneven sides: `teamBPlayers: 7` in an 8-a-side match | B is all out at 6 wickets (7 with last man stands). B wins a chase 3 down: "won by 3 wickets" | BR-MC-03, BR-MC-04 | SE |
| EC-B-08 | Side short by 2 absent players (11-a-side, 9 present) | All-out threshold stays at 10. At the 8th wicket, with no one left, "End innings" → `batters_unavailable`, absentees named → "absent" rows, innings counted as all out | BR-MC-04, BR-BT-07 | SE |
| EC-B-09 | Absentee named who already batted | Rejected: `INVALID_ABSENTEE` | BR-BT-07 | SE |
| EC-B-10 | A late arrival joins mid-innings | Added to the squad (a new player can be created on the spot) and immediately available as the next batter or a bowler, in the same action | BR-MC-13 | SV, UI |
| EC-B-11 | Guest player from another club | Allowed. `MatchPlayer.teamId` is the side for this match. The home team is unchanged | BR-MC-12 | SE |
| EC-B-12 | Squad has fewer players than `playersPerSide` at the start | Allowed (gully). The innings ends by `batters_unavailable` when needed. Warning `SQUAD_EXHAUSTED` when no candidate is left | BR-MC-04 | SE |
| EC-B-13 | `playersPerSide: 2` | All out after 1 wicket (2 with last man stands). Super-over wickets = min(2, 1) = 1 | BR-MC-04, BR-MC-05 | SE |
| EC-B-14 | Declaration in a limited-overs match | `innings_ended {declared}`, no absentees. The target is set from the declared total | BR-BT-08 | SE |
| EC-B-15 | ⚠ Gap: a retired-hurt batter who never returns is also named as an absentee | The contract allows it, and the card would then read "absent hurt". Laws convention is "retired hurt". Recommendation: the UI does not pre-select retired-hurt batters as absentees. | BR-BT-07 | UI |

## 5. Innings, targets and rain

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-I-01 | Target reached mid-over | Innings `target_reached`. No more deliveries. `confirm_result` shows "won by N wickets (M balls left)" | BR-IN-01, BR-RS-03 | SE |
| EC-I-02 | Target reached with a wide or no-ball penalty | Same as EC-I-01. A wide doesn't count as a ball, so balls remaining is unchanged | BR-IN-01 | SE |
| EC-I-03 | Needing 5, the batter hits a six | All 6 runs count toward the total. The result is by wickets | BR-DR-03 | SE |
| EC-I-04 | **Target revised mid-innings**: a 20-over chase of 161, rain at 10.0 (80/2), then 15 overs with target 121 | Current innings `maxBalls: 90`, target 121. The header shows "Need 41 from 30 balls". If reached at 12.3: "won by 8 wickets (15 balls left) (revised target)" (`method: 'revised_target'`) | BR-RV-02, BR-RV-03 | SE |
| EC-I-05 | Revised target set below the runs already scored | Immediately `target_reached` → `confirm_result` | BR-RV-09 | SE |
| EC-I-06 | Revision to fewer balls than already bowled | Rejected: `INVALID_OVERS_REVISION` | BR-RV-02 | SE |
| EC-I-07 | Revision equal to the balls already bowled in innings 0 (no more play in the 1st innings) | Innings 0 completes (`overs_complete`). Revise the chase separately (warning `CHASE_OVERS_NOT_REVISED` if not planned) | BR-RV-02, BR-RV-05 | SE |
| EC-I-08 | "Both innings" revision from 20 to 12 before the 1st innings ends | Two events under one action: the current innings goes to 72 balls, and innings 1 is planned at 72 balls. One undo removes both | BR-RV-05 | SE |
| EC-I-09 | Target set on the 1st innings | Rejected: `INVALID_TARGET` | BR-RV-03 | SE |
| EC-I-10 | Powerplay 1–6 and overs revised to 5 | The powerplay is clamped to overs 1–5 unless new phases are given | BR-RV-04 | SE |
| EC-I-11 | **Rain ends the chase for good** at 14.2 (86 balls), with a par of 120 after 86 balls | While paused: `overs_revised {terminal, maxBalls: 86, target: 121}` → innings `terminated`. `confirm_result` takes priority over `resume_play`. 141 → "Lions won by 21 runs (par score)". 110 → first-innings side "won by 10 runs (par score)". 120 → "Match tied (par score)". Confirmed while paused | BR-RV-07, BR-RV-08 | SE |
| EC-I-12 | Terminal revision on the first innings | Rejected (only for the chase in progress). Use a normal revision and then a revised chase, or `no_result` | BR-RV-07 | SE |
| EC-I-13 | Organizer asks for a DLS target | Not computed. They type it (e.g. from the DLS sheet), or accept the average-run-rate suggestion ⌊runs × chase balls ÷ first-innings balls⌋ + 1 | BR-RV-06 | UI |
| EC-I-14 | Suspended, and then the scorer tries to record a ball | Rejected: `PLAY_SUSPENDED`. The pad shows "Resume play" | BR-SU-02 | SE, UI |
| EC-I-15 | Suspended during a tie, and the super over is chosen | `super_over_started` needs `play_resumed` first. Accepting the tie can be done while paused | BR-SU-02, BR-RS-04 | SE |
| EC-I-16 | Last legal ball of the chase is a no-ball | Not legal. The innings is not complete. One more ball, which is a free hit | BR-DR-07 | SE |

## 6. Penalty runs

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-PN-01 | 5 penalty runs to the batting side take the chase past the target | Chase completes (`target_reached`) → `confirm_result` | BR-PN-04 | SE |
| EC-PN-02 | 5 penalty runs to the side that has not batted yet (awarded during the 1st innings) | Carried (`carriedPenalties`) and added when its innings starts | BR-PN-03 | SE |
| EC-PN-03 | 5 penalty runs to the fielding side after it has batted (chase in progress) | Added to its completed 1st innings. The chase target rises by 5 | BR-PN-04 | SE |
| EC-PN-04 | 5 penalty runs to the batting side for a Law 28.3 helmet strike on the last ball of a tied chase, recorded after that ball | The runs go to the just-completed chase innings. Chase runs are now ≥ target, so the tie becomes a win for the chasing side by wickets. The innings is not reopened for deliveries | BR-PN-05 | SE |
| EC-PN-05 | Penalty during a super over naming innings 0 or 1 | Rejected: `INVALID_PENALTY_INNINGS`. Super-over penalties stay in their round | BR-PN-02 | SE |
| EC-PN-06 | Penalty while play is suspended | Allowed | BR-PN-06 | SE |
| EC-PN-07 | Penalty of 0 or 100 runs | Rejected: `INVALID_PENALTY` | BR-PN-01 | SE |

## 7. Results, ties and super overs

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-R-01 | Result reached, and the scorer realises the last ball was mis-tapped | Undo (the result isn't final until confirmed). Standings are unchanged because `match_ended` was never recorded | BR-RS-03 | SE, SV |
| EC-R-02 | Tie, super overs disabled | `resolve_tie` offers Accept Tie or Decide Otherwise (bowl-out, coin toss, organizer) | BR-RS-05 | SE |
| EC-R-03 | **Tie, then the super over is also tied**, `ifTiedAgain: 'repeat'` | `resolve_tie` offers round 2. With `restrictRepeatPlayers`, batters dismissed in round 1 and round 1's bowler are ineligible (`PLAYER_INELIGIBLE_SUPER_OVER`). Round 2's batting order is suggested reversed | BR-RS-08, BR-RS-09 | SE |
| EC-R-04 | Super over tied, `ifTiedAgain: 'boundary_count'` | The side with more 4s + 6s over the match and the super over wins: "Match tied — Tigers won on boundary count". If still level → undecided, `resolve_tie` | BR-RS-09 | SE |
| EC-R-05 | Super over tied, `tie_stands` | Undecided tie. The organizer may accept the tie or decide otherwise | BR-RS-09 | SE |
| EC-R-06 | `maxRounds: 2` reached and still tied | Super over is no longer offered (`SUPER_OVER_LIMIT_REACHED`). Accept or decide otherwise | BR-RS-09 | SE |
| EC-R-07 | Super-over side of 11 loses 2 wickets | Super-over innings is all out (`maxWickets` 2) | BR-MC-05 | SE |
| EC-R-08 | League match decided by super over, `superOverDecidedTie: 'win_loss'` | The table shows W/L and win points, and the scorecard shows "Match tied — Tigers won the Super Over". NRR uses the main innings only | BR-PT-04, BR-NR-07 | TST |
| EC-R-09 | Same, `superOverDecidedTie: 'tie'` | Both teams get tie points and a T. The decider matters only in knockouts | BR-PT-04 | TST |
| EC-R-10 | **Abandoned after the 1st innings** | `match_ended {abandoned, reason}`. The in-progress innings closes with `match_ended`. Status `abandoned`. Both teams get NR (points = `abandoned ?? noResult`). NRR excluded by default. With `includeAbandoned`, only innings with ≥ 1 legal ball count (team A's runs and balls for A, and against B). Knockout → `noResult` policy. Fixture → `abandoned`, and replay only if allowed | BR-RS-14, BR-PT-02, BR-NR-06, BR-FX-08 | SE, TST |
| EC-R-11 | Abandoned without a ball bowled (washout) | `scheduled → abandoned`. No innings. NR in the table and counted as played (see open question 3) | BR-ML-04, BR-PT-06 | SE, TST |
| EC-R-12 | No result declared mid-chase | Result `no_result`, status `completed`. NR column | BR-RS-14 | SE |
| EC-R-13 | **Walkover** before any ball | A single `match_ended {walkover}` event. "Tigers won by walkover". No innings. Points `walkoverWin/Loss ?? win/loss`. NRR excluded (or notional figures under that policy) | BR-RS-12, BR-PT-02, BR-NR-06 | SE, TST |
| EC-R-14 | Walkover requested after `innings_started` but before the first delivery | Allowed (no delivery recorded yet) | BR-RS-12 | SE |
| EC-R-15 | Walkover requested after deliveries | Rejected: `WALKOVER_AFTER_PLAY`. Use Awarded with a reason | BR-RS-12, BR-RS-13 | SE |
| EC-R-16 | Match conceded mid-chase | `awarded` to the other side with a reason (the margin is optional). Points win/loss. NRR excluded by default, or played innings with `use_played_innings` | BR-RS-13, BR-NR-06 | SE, TST |
| EC-R-17 | Awarded as no-winner | Treated as NR for points | BR-RS-13, BR-PT-03 | TST |
| EC-R-18 | Postponed match later played | Match `postponed → scheduled` (standalone) or fixture `postponed → rescheduled → live` | BR-ML-04, BR-FX-05 | SE, TS |

## 8. Corrections (undo, redo, edit)

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-C-01 | Undo a caught wicket that was recorded with the incoming batter | One undo removes both events (one action). The batter, bowler figures and over position are restored | BR-CR-01 | SE |
| EC-C-02 | Undo at the start of the second innings | Removes `innings_started`. The prompt returns to `start_next_innings` | BR-CR-01 | SE |
| EC-C-03 | Redo after a new ball was recorded | The redo stack is cleared. A stale redo returns `REDO_STALE` | BR-CR-03 | SE, SV |
| EC-C-04 | Redo after an app restart | Not available (the redo stack is session-only) | BR-CR-03 | SV |
| EC-C-05 | Undo `match_ended` of a tournament match | Needs a reason and shows the impact. Audited `match_reopened`. Standings revert. Fixture `completed → live` | BR-CR-04 | SV |
| EC-C-06 | ⚠ Gap: undo `match_ended` of a standalone completed match | The contract requires a reason only for tournament matches. Recommendation: confirm the reopen and audit it as `match_reopened` (tournament id null) | BR-CR-04 | SV |
| EC-C-07 | Edit 17.3 from FOUR to 1 | Later strikers are re-derived and re-stamped. Cards, partnerships and the result are recomputed. `resultChanged` is reported | BR-CR-05 | SE |
| EC-C-08 | Edit a wide to a legal dot | The over ends one delivery earlier. The next over's `bowler_selected` is re-anchored earlier | BR-CR-05 | SE |
| EC-C-09 | Edit a legal ball to a wide | The over gains a delivery. The re-anchored selection moves later. If the innings now has more overs than allowed, surplus selections are dropped and reported | BR-CR-05, BR-CR-06 | SE |
| EC-C-10 | Remove a wicket but keep the following `batter_in` | Refused: `NO_VACANCY` at that seq. The guided UI removes both | BR-CR-06 | SE, UI |
| EC-C-11 | An edit in the 1st innings raises its total, so the chase that had been won no longer reaches the target | If the result was not confirmed yet, the chase simply resumes (the pending action goes back to scoring). If `match_ended {natural}` was recorded, the edit is refused (`NATURAL_RESULT_NOT_REACHED` at that seq), and the organizer must also remove `match_ended` (reopen) in the same edit. Tournament impact is shown | BR-CR-05, BR-CR-06 | SE, SV |
| EC-C-12 | An edit lowers the 1st-innings total, so the chase would have been won earlier | Refused while later deliveries remain: they fail with `INNINGS_NOT_IN_PROGRESS` at the first seq after the new `target_reached`. The organizer removes the trailing deliveries in the same edit. The result becomes the earlier win (wickets and balls left recomputed) | BR-CR-05 | SE |
| EC-C-13 | Preview an edit, then someone undoes and records a new ball (same `lastSeq`) before Apply | Apply fails with `CONFLICT` (fingerprint differs). Re-preview | BR-CR-07 | SV |
| EC-C-14 | Edit a live match | A warning (not a confirmation). Still audited (`match_history_edited`) with the removed and inserted events | BR-CR-08 | SV |
| EC-C-15 | Edit a completed standalone match | Confirmation and a reason. Audited (tournament id null) | BR-CR-08 | SV |
| EC-C-16 | A log that `needsRepair` (e.g. an event invalid under a new engine version) | Replay skips only that event and applies the rest. The match opens with "This match needs repair". Recording, redo, ending the match and rules edits are refused (`FORBIDDEN_STATE`). Only an edit or undo whose result replays cleanly is accepted. Projections are not rewritten from the degraded replay | BR-ML-09 | SE, SV |
| EC-C-17 | A stale context stamp in a stored delivery (e.g. an older app version) | Replay applies the delivery with the derived striker/bowler and records a warning issue. No repair is needed | BR-SF-06 | SE |
| EC-C-18 | Rules edit mid-match that would invalidate the log (e.g. `playersPerSide` reduced below the wickets already fallen) | Refused. The log must still replay without errors | BR-ML-08 | SV |
| EC-C-19 | Toss corrected after the 1st innings started, to a value inconsistent with who batted | Refused (`TOSS_MISMATCH`) | BR-MC-10 | SV |
| EC-C-20 | Remove a squad player who opened but never faced | Refused (`FORBIDDEN_STATE`). They are referenced by `innings_started` | BR-MC-14 | DB, SV |

## 9. Recovery, persistence and device

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-P-01 | **Device dies mid-transaction** while a ball is being saved | SQLite rolls back the incomplete transaction on the next open. The ball is either fully present (event and projections) or absent. The resume prompt shows the last committed state. The scorer re-taps if the ball is missing | NFR-R-01, NFR-R-02 | DB, SV |
| EC-P-02 | Battery dies right after "saved" | The ball survives (`synchronous = FULL`) | NFR-R-02 | DB |
| EC-P-03 | Crash during a history edit, tournament change, import or migration | Nothing of that use case is visible after restart. A migration is retried on the next launch. An import can be repeated | NFR-R-01, NFR-R-07 | DB, SV |
| EC-P-04 | Two quick taps | Deliveries are processed one at a time. The second is validated against the state after the first | FR-S-14 | SV |
| EC-P-05 | A write with a stale `expectedLastSeq` (e.g. the same match open in two screens) | `CONFLICT`. The store reloads, clears redo and shows a message. No event is lost or duplicated | NFR-R-06 | SV |
| EC-P-06 | Disk full while saving a ball | `STORAGE` error: "Couldn't save this delivery. Your previous match data is still safe. [Try Again]". The screen keeps the last saved state | FR-A-06 | SV |
| EC-P-07 | App updated with a scoring-engine fix | Bootstrap rebuilds projections whose `projection_version` is older. Standings update. Matches that need repair are reported, not rewritten | FR-R-05 | SV |
| EC-P-08 | Database from a newer app version (e.g. restored phone backup) | Not modified (`SchemaTooNewError`). The user sees "Update Scorebook to open this data" | NFR-R-07 | DB |
| EC-P-09 | Device clock is wrong or changes mid-match | Event order uses `seq`, never time. Timestamps are cosmetic | NFR-C-04 | SE |
| EC-P-10 | App killed by the OS in the background (low memory) during scoring | Same as a crash. On return, the resume prompt appears (or the match reopens at the same state) | §23 | SV |
| EC-P-11 | Rotation, split-screen or theme change mid-scoring | No state is lost. The layout adapts (two-pane at ≥ 768 dp) | NFR-U-05 | UI |
| EC-P-12 | PDF generation interrupted | No database effect. The temporary file is discarded. Retry | §93 | EX |
| EC-P-13 | The same match scored on two devices at once (unsupported) | Each device has its own copy. Importing one into the other shows an aggregate conflict. The organizer chooses skip, copy or replace. Logs are never merged | BR-DB-05 | SV |

## 10. Tournament structure, pools and fixtures

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-T-01 | Tournament with 1 team | Can't reach `structure_configured` (needs ≥ 2 teams) | BR-TS-02 | TS |
| EC-T-02 | 128 teams in one league | 8,128 fixtures in 127 rounds. Lists are virtualised. Evaluation within the NFR-S-04 budget | NFR-S-04 | TS, TST |
| EC-T-03 | 10 teams in 3 pools | 4/3/3 and the uneven warning | BR-PL-03, BR-PL-08 | TS |
| EC-T-04 | Pool with a single team, or an empty pool | Warning. A single-team pool generates no fixtures, and its team is 1st once the stage completes | BR-PL-08 | TS |
| EC-T-05 | Odd number of teams in round robin | One bye per round. n rounds per leg | BR-FX-01 | TS |
| EC-T-06 | 3-team pool at 2 legs next to 4-team pools at 1 leg | The 3-team pool gets 6 fixtures. No duplicate-encounter warning | BR-PL-09 | TS |
| EC-T-07 | Random draw repeated with the same seed | Identical pools. A new seed gives a new draw, shown with "Current pool arrangement will be replaced." | BR-PL-04, BR-PL-07 | TS, UI |
| EC-T-08 | Text seed "Spring Cup" | Hashed (FNV-1a) to a number. Reproducible | BR-PL-04 | TS |
| EC-T-09 | Team directly entered into the semifinal | Not in the first stage's entrants, and not reported as unassigned | BR-TS-09, BR-PL-08 | TS |
| EC-T-10 | Manual fixture with the same team on both sides | Blocked | BR-FX-03 | TS |
| EC-T-11 | Manual fixture repeating an encounter beyond the pool's legs, or a team double-booked at the same time, or a date outside the tournament | Warnings, not blocks | BR-FX-03 | TS |
| EC-T-12 | Regenerate fixtures after 3 matches were played | Only fixtures without a match are replaced. Played fixtures remain. Impact preview | BR-FX-02 | TST |
| EC-T-13 | Fixture postponed, then rescheduled, then postponed again | Allowed. `rescheduled → postponed` is an organizer state change (`canTransitionFixture`, added when gap G-8 was closed on 2026-10-01). The fixture can be rescheduled again later | BR-FX-05 | TS |
| EC-T-14 | Fixture cancelled | Counts for nobody and isn't played. It can be restored (audited) | BR-FX-06 | TST |
| EC-T-15 | Abandoned fixture in a stage with `abandonedMatches: 'replay'` | Reschedule clears the current match. The abandoned result stops counting. The replay is a new match. The old match stays in history linked to the fixture | BR-FX-08 | SV |
| EC-T-16 | Same, with `abandonedMatches: 'no_result'` | Rescheduling isn't offered. It stays NR | BR-FX-08 | TS |
| EC-T-17 | Completed fixture moved to another pool | Confirmation. The result moves between tables. Impact shown | BR-FX-09 | TST |
| EC-T-18 | Delete a fixture whose match is completed | Blocked. Detach or delete the match explicitly first | BR-FX-09 | TST |
| EC-T-19 | 3 pools, top 2 each (6) with fixed seeding | Byes to A1 and B1. The unrepaired seed order would pair C1 v C2 (a same-pool rematch), so the §6.1.2 repair pass swaps second sides and round 1 is **A2 v C2 and C1 v B2** (`seedEntrants`, CONTRACT_REFERENCE). A same-pool pairing survives only when no swap works, and then the preview warns. Organizers can still edit the pairings in the fixture preview | BR-KO-06 | TS |
| EC-T-20 | 6 knockout entrants seeded by ranking before all groups finish | Blocked: "Seeding by ranking is possible once all 6 qualifiers are known." | BR-KO-07 | TS |
| EC-T-21 | Knockout re-draw after some round-1 matches were played | Only fixtures without a match are replaced. Progression slots survive (bracket positions). ⚠ Gap: whether a re-draw may move a played fixture's bracket position is not specified. Recommendation: block re-draws once any round-1 match has started | BR-KO-03 | TST |
| EC-T-22 | Tournament deleted with 12 completed matches | Counts are shown. A backup is offered. Typed name plus the "delete completed matches" opt-in are required. Matches are deleted explicitly, then the tournament | BR-CC-13 | SV |
| EC-T-23 | Tournament archived | Every edit is forbidden, including delete, until it's unarchived | BR-CC-02 | TS |

## 11. Team changes, standings, NRR, tie-breakers, qualification, overrides

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-Q-01 | **Team edited after fixtures exist**: renamed in the library | The new name shows everywhere, including past scorecards and PDFs (names resolved at load). Results are unaffected. Not a tournament change | BR-DB-10 | DB |
| EC-Q-02 | Team edited after fixtures: short name changed to 6 characters, or to 1 character | Rejected by validation: the contract (`Team.shortName`) is 2–5 characters and is canonical; the DB CHECK (1–5) is only a looser backstop | NFR-S-17 | SV, DB |
| EC-Q-03 | Team archived while in an active tournament | Archived teams stay in the tournament and history. They're only hidden from pickers for new matches and tournaments | BR-DB-09 | DB |
| EC-Q-04 | Player removed from the team library after playing | Archived, not deleted. Past squads and events keep them | BR-DB-09 | DB |
| EC-Q-05 | **Team moved** Pool A → Pool C after 1 of 3 matches | Preview lists exactly the unplayed Pool A fixtures to remove and the Pool C fixtures to create. The played fixture stays in Pool A. Standings of both pools change. Audited `team_moved` | BR-CC-06 | TST |
| EC-Q-06 | Team swap after fixtures | Members exchange unplayed fixtures. Played ones are kept | BR-CC-07 | TST |
| EC-Q-07 | Team replaced, `transfer_to_replacement` | The replacement's row aggregates the predecessor's results. The predecessor is `replaced` and has no row of its own | BR-CC-08 | TST |
| EC-Q-08 | Team replaced, `keep_for_opponents` | The predecessor keeps a non-qualifying row (membership `replaced`). The replacement starts at 0 | BR-CC-08 | TST |
| EC-Q-09 | Team replaced, `expunge` | An `expunge_results` override (Manual Override) removes every result involving the predecessor. Opponents lose those points and NRR contributions | BR-CC-08, BR-NR-08 | TST |
| EC-Q-10 | **Team withdraws mid-tournament**, walkover option | Remaining fixtures become matches with a `match_ended {walkover}` event for the opponent (real log entries). The withdrawn team stays as a non-qualifying row. Qualification is recomputed. Audited `team_withdrawn` with the impact | BR-CC-09, BR-QL-06 | TST, SV |
| EC-Q-11 | Team withdraws, cancel option plus expunge | Remaining fixtures are cancelled, and past results are expunged (fewer matches for everyone else in that pool). The uneven-matches warning applies to cross-pool comparisons | BR-CC-09 | TST |
| EC-Q-12 | ⚠ Gap: team withdraws while one of its matches is live or paused | Not specified. Recommendation: `blocked` in the impact ("End the live match first") until that match is ended (abandoned, no result or awarded) | BR-CC-09 | TST |
| EC-Q-13 | Withdrawn team's remaining fixture is `postponed` and the walkover option is chosen | The walkover match is created like any other remaining fixture's, and the fixture mirrors it as `completed`. Both machines allow `postponed → completed` (the fixture guard since gap G-8 was closed on 2026-10-01); the fixture still needs its match | BR-FX-05 | TS |
| EC-Q-14 | NRR, all out early (ICC): A 150 all out in 32.1 of 40 overs; B chases 151 in 30.2 | A: 150 for in 40 overs, 151 against in 30.333 overs. B: 151 for in 30.333, 150 against in 40 | BR-NR-03 | TST |
| EC-Q-15 | NRR, `actual_overs` mode, same match | A: 150 in 32.167 overs | BR-NR-04 | TST |
| EC-Q-16 | NRR with a revised target (`icc_par`): the chase is reduced to 30 overs with target 181 | The side batting first is credited 180 runs off 30 overs (instead of its actual figures) | BR-NR-05 | TST |
| EC-Q-17 | NRR, mixed 6-ball and 8-ball matches | Overs per match = balls ÷ that match's balls per over, then summed | BR-NR-01 | TST |
| EC-Q-18 | Team with only NR matches | NRR null ("–"). Ranked by the next criteria | BR-NR-01 | TST |
| EC-Q-19 | **Uneven pools, best runner-up**: A (4 teams), B and C (3 teams), 2 pts a win. A2 has 4 pts from 3 games (beat A4 and A3); B2 and C2 have 2 pts from 2 | `raw`: A2 best (4). `per_match_average`: A2 1.33 v B2 1.00 v C2 1.00 → A2. `drop_extra_results`: A2's result against A4 is dropped → A2 2 pts from 2, level with B2 and C2, then the stage tie-breakers (e.g. NRR over counted matches) decide. The comparison table is shown with the normalisation named | BR-QL-08 | TST |
| EC-Q-20 | **Three-way tie with head-to-head**, chain Points → H2H → NRR. A, B, C on 6 pts. A beat B, B beat C, C beat A | Mini-league is all level (2 pts each), so H2H can't separate them. All three go to NRR | BR-TB-03, BR-TB-04 | TST |
| EC-Q-21 | Three-way tie: A beat B and C; B v C no result | H2H: A 4, B 1, C 1 → A first. B and C go to NRR, **not** their own head-to-head (no restart). With `headToHeadRequiresCompleteMiniLeague`, the NR makes the mini-league incomplete, so H2H is skipped and all three go straight to NRR | BR-TB-03, BR-TB-04 | TST |
| EC-Q-22 | Two teams level after every criterion, table complete, 2nd v 3rd with top 2 qualifying | `unresolvedTies`: "Level with Lions — organizer decision required". The slot is provisional until a `tie_resolution` (organizer decision, or a draw of lots with a recorded seed) | BR-TB-06, BR-TB-08 | TST |
| EC-Q-23 | Same level pair, but 3rd v 4th with only the top 2 qualifying | `provisionalTies` only. Shared position, no call to action | BR-TB-08 | TST |
| EC-Q-24 | ⚠ Gap: tie for 1st in a champion-deciding league with no downstream stage | By BR-TB-08 this isn't a slot boundary, so no decision is asked for and `resolveChampion` has no single top team. Recommendation: treat position 1 of a `decidesChampion` table as a boundary (require a tie resolution or a `champion` override) | BR-KO-11 | TST |
| EC-Q-25 | Tie-breaker chain changed after a `tie_resolution` override exists | The override applies only if its team set exactly equals a level group under the new chain. Otherwise it stays active but has no effect. Revoke it to clear it | BR-TB-06 | TST |
| EC-Q-26 | Pool winner is also the best runner-up candidate (one entry slot per team per stage) | The team takes the first entry slot (A1). The best-runner-up slot skips it and explains why | BR-QL-05 | TST |
| EC-Q-27 | Positions 3–4 go to the Plate and 1–2 to the Cup | Each team shows a status per target stage: "Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd." | BR-QL-09 | TST |
| EC-Q-28 | Qualification with 12 fixtures remaining (above the enumeration limit) | Conservative bounds. Statuses may stay "in contention" rather than be wrongly "qualified" or "eliminated" | BR-QL-11 | TST |
| EC-Q-29 | Bonus point enabled | Enumeration includes win and win-plus-bonus outcomes. A team is "mathematically qualified" only if it's safe against rivals' bonus wins too | BR-QL-11 | TST |
| EC-Q-30 | **Match correction after qualification was computed, before the SF is played** | A1 changes from Tigers to Lions. The unplayed SF1 automatically shows Lions. Preview lists the qualification change. Audited `result_corrected` | BR-CC-10, BR-FX-07 | TST, SV |
| EC-Q-31 | **Match correction after the SF was played** | SF1's sides are frozen (Tigers v Eagles). The slot conflict is shown (`playedFixtureIds`). On accept, SF1, "Winner SF1" and the final stand as played, and the A1 slot shows the conflict. Alternatively, pin A1 to Tigers with a `slot_assignment` override. Audited either way | BR-CC-10 | TST |
| EC-Q-32 | Correction of a completed final | Champion projection updated in the same transaction. Tournament `completed → active` if reopened. Audited | BR-CC-14 | SV |
| EC-Q-33 | Knockout match tied, `tiedMatch: 'super_over'`, the super over is tied and `maxRounds` is reached | Organizer decision required. The winner slot stays pending until `tie_decided` or a `slot_assignment` | BR-KO-08 | TST |
| EC-Q-34 | Knockout washed out, `noResult: 'higher_seed'`, neither team has a seed (manual slots, no pre-tournament seeds) | Organizer decision required | BR-KO-09 | TST |
| EC-Q-35 | Final washed out, `noResult: 'shared'` | Joint champions. Tournaments list shows "Lions & Tigers" | BR-KO-11 | TST |
| EC-Q-36 | ⚠ Gap: knockout `tiedMatch: 'boundary_count'` | The contract doesn't define how it's applied (neither `knockoutAdvancer` nor `startFixtureMatch` describes it). Recommendation: `startFixtureMatch` disables super overs for the fixture, and an undecided main-match tie is decided by boundary count (4s + 6s), as `SuperOverTieBreak 'boundary_count'` does, still level → organizer decision required | KnockoutConfig | TS |
| EC-Q-37 | Plate stage has the highest order index | The champion still comes from the Cup stage (`decidesChampion`) | BR-TS-07 | TST |
| EC-Q-38 | Qualification override "qualify Team X into SF slot 2" | X takes the slot. The automatic occupant is displaced (explained). "Manual Override" badge with the reason. Revocable | BR-OV-01 | TST |
| EC-Q-39 | Points deduction of −2, later revoked | The table changes both times. Both actions are audited. The override stays in history as revoked | BR-OV-03 | TST |
| EC-Q-40 | Preview a pool move, and meanwhile a match completes (revision bumped) | Apply fails with `CONFLICT`. Re-preview | BR-CC-04 | SV |
| EC-Q-41 | Points system changed from 2/1/1/0 to 4/2/2/0 after matches | Confirmation and a reason. Every table is recomputed. Impact lists position changes. Audited `rules_changed` | BR-CC-02 | TST |
| EC-Q-42 | Super 8 group built from slots before the groups finish | The table shows rows "A1", "B2"… and later "A1 · Tigers (provisional)". Fixtures between slots already exist | BR-PL-06 | TST |
| EC-Q-43 | What-if on a fixture whose sides aren't resolved yet | Skipped, with a narrative explanation. Chained what-ifs (QF then SF) work stage by stage | FR-D-03 | TST |
| EC-Q-44 | What-if never mutates | Snapshot is deep-frozen in tests. Revision and audit are unchanged | FR-D-03 | TST |

## 12. Data, backup and import

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-X-01 | **Duplicate import** (the same file imported twice) | Preview: "Already imported on …" (`previouslyImportedAt`), and every aggregate is listed as a conflict. `skip_existing` inserts nothing. `import_as_copy` creates a second, remapped tournament (⚠ Gap: no naming rule for copies; recommendation: add " (copy)"). `replace_existing` lists local-only matches and events first | BR-DB-04–BR-DB-06 | SV, EX |
| EC-X-02 | Two scorers export overlapping tournament data | Aggregate conflict on the tournament. Choose a policy. Never a row-level merge | BR-DB-05 | SV |
| EC-X-03 | Checksum mismatch (the file was edited) | Error `CHECKSUM_MISMATCH`. Import disabled | BR-DB-03 | EX |
| EC-X-04 | Missing checksum (hand-made file) | Warning `CHECKSUM_MISSING`. Import allowed after validation | BR-DB-03 | EX |
| EC-X-05 | Schema version newer than the app | Refused: `SCHEMA_TOO_NEW` | BR-DB-03 | EX |
| EC-X-06 | Event payload references a player not in the file or the database | `MISSING_REFERENCE` with its JSON path | BR-DB-03 | EX |
| EC-X-07 | A match log in the file doesn't replay | `INVALID_EVENT_LOG`. Import disabled. Hand-edited stamps are normalised first (`normalizeLog`) so only real errors block | BR-DB-03 | EX |
| EC-X-08 | Invalid JSON or the wrong file | `INVALID_JSON` / `INVALID_FORMAT` with a human message | BR-DB-03 | EX |
| EC-X-09 | Backup includes logos and settings | Logos cleared unless the file exists. Settings applied only on opt-in | BR-DB-07 | SV |
| EC-X-10 | Import of a knockout tournament (circular slot ↔ fixture ↔ match references) | Inserted in one transaction. Deferred FKs are checked at commit. `foreign_key_check` is empty | BR-DB-08 | DB |
| EC-X-11 | Import as copy of a full backup | No original id remains in any reference (audit values excepted). Every copied match replays with zero issues | BR-DB-05 | EX |
| EC-X-12 | Library team in the file has the same id as a local team but a different name | `skip_existing` keeps the local name. `replace_existing` updates in place. `import_as_copy` creates a new team | BR-DB-05 | SV |

## 13. UI and presentation

| ID | Situation | Expected behaviour | Rules / codes | Test |
|---|---|---|---|---|
| EC-U-01 | Very long team name (60 characters) | The scoreboard uses the short name. Tables truncate with the full name in the accessibility label. The PDF wraps | NFR-S-17 | UI, EX |
| EC-U-02 | Urdu or Hindi player names | Render correctly in the app and the PDF | NFR-S-17 | UI, EX |
| EC-U-03 | 200% font scale on a 360 dp phone | The score, overs and pad stay visible. Secondary rows wrap | NFR-A-04 | UI |
| EC-U-04 | Screen reader on, ball recorded | Announces e.g. "Four. Pakistan XI 146 for 4, 16.5 overs" | NFR-A-03 | UI |
| EC-U-05 | Colour-blind user reads the current over | Tokens are distinguishable by text (W, WD, NB, 4, 6), not by colour | NFR-A-05 | UI |
| EC-U-06 | `select_next_batter` with no candidates | Offers "Add player" and "End innings (no batters available)". Never a dead end | FR-W-07 | UI |

---

## 14. Summary of contract gaps and inconsistencies raised by these cases

| Ref | Issue |
|---|---|
| EC-B-15 | Absentees may include retired-hurt batters, so the card would read "absent hurt" instead of the conventional "retired hurt". |
| EC-C-06 | Reopening a completed **standalone** match: whether it needs a reason or an audit entry is unspecified. |
| EC-T-13, EC-Q-13 | Resolved 2026-10-01 (gap G-8): `canTransitionFixture` gained `rescheduled → postponed` and `postponed → completed`, and STATE_MACHINES §5 shows both. |
| EC-T-19 | Resolved in wave 1: `seedEntrants` runs the §6.1.2 repair pass for odd pool counts (3 pools × 2 → A2 v C2, C1 v B2). A same-pool round-1 pairing remains only when no swap can avoid it, and the preview warns. |
| EC-T-21 | Knockout re-draw after some bracket matches have started is not specified. |
| EC-Q-02 | `Team.shortName` is 2–5 characters in the contract (canonical) but the DB CHECK allows 1–5. Resolved in docs: services and forms validate 2–5; the CHECK stays as a backstop (a migration is not worth it). |
| EC-Q-12 | Withdrawal of a team with a live or paused match is not specified. |
| EC-Q-24 | A level group at position 1 of a champion-deciding league with no downstream stage never becomes an `unresolvedTie`. |
| EC-Q-36 | `KnockoutConfig.tiedMatch: 'boundary_count'` has no defined behaviour. |
| EC-X-01 | No naming rule for aggregates imported as a copy. |
