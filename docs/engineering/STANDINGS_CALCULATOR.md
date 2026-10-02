# Standings Calculator Design

Engineering design for the §60 "StandingCalculator": `src/domain/tournament/standings.ts` and `tiebreakers.ts` (owner WP-tournament-standings). NRR figures come from [NRR_CALCULATOR.md](NRR_CALCULATOR.md); qualification and slot boundaries from [QUALIFICATION_ENGINE.md](QUALIFICATION_ENGINE.md). Contract: `computeStandings(input: StandingsInput): StandingsTable`, `rankTeams(records, chain, ctx)`, `describeTieBreakerChain`, `tieBreakerLabel` in [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md).

Contents: 1 inputs · 2 counting rules · 3 points per result · 4 row aggregation · 5 tie-break algorithm · 6 explanation strings · 7 manual overrides · 8 uneven pools · 9 worked examples · 10 tests.

---

## 1. Inputs

`computeStandings` is a pure function of one `StandingsInput`, assembled by `evaluate.ts` per pool (or per cross-pool comparison):

| Field | Source | Notes |
|---|---|---|
| `members` | pool entries resolved through slots + kept predecessors | one row per member; unresolved slot → `teamId: null`, `slotLabel: "A1"` |
| `fixtures` | the pool's fixtures (all stage fixtures for an overall table) | |
| `fixtureTeams(f)` | `resolveFixtureTeams` | frozen `matchSides` once the fixture has a match |
| `summaries` | `snapshot.summaries` | only CURRENT, TERMINAL matches (`fixtures.match_id`); stale projections excluded |
| `rules` | `effectiveStageRules(snapshot, stageId)` | stage override ?? tournament default for points, NRR, tie-breakers, H2H completeness flag |
| `overrides` | all tournament overrides | only active ones of matching kind / stage / pool apply |
| `seeds`, `teamNames` | tournament teams | names only for explanation text |
| `normalization`, `poolOrder` | cross-pool tables only | §8 |

The calculator never reads events. Everything scoring-related comes from `MatchSummary` (`result`, `winnerTeamId`, regular `innings` with `runs`, `legalBalls`, `allottedBalls`, `allOut`, `target`, `targetRevised`, `ballsPerOver`).

## 2. Counting rules

A fixture contributes to a table when **all** hold:

1. it has a current match with a summary (terminal: `completed` or `abandoned`);
2. both frozen teams are members of this table — an active member, a kept predecessor (`membership ≠ active`), or a team listed in some member's `inheritsFrom` (its result is then credited to that member's row);
3. no active `expunge_results` override names either team for this stage (or `stageId: null`).

Cancelled fixtures never have summaries and count nowhere (not "played"). A rescheduled replay clears `fixtures.match_id`, so the abandoned first attempt stops counting until the replay is played.

`matchesRemaining` = fixtures of the scope involving the member whose status is not terminal (`completed`, `abandoned`) or `cancelled`. `played` = counted fixtures.

## 3. Points per result

With `P = rules.points` (`PointsSystem`):

| `MatchResult` | Condition | Winner / side A | Loser / side B | Column |
|---|---|---|---|---|
| `win` | — | `P.win` (+ bonus, §3.1) | `P.loss` | W / L |
| `tie` | `decider = null` | `P.tie` | `P.tie` | T / T |
| `tie` | decider set, `superOverDecidedTie = 'win_loss'` | `P.win` | `P.loss` | W / L |
| `tie` | decider set, `superOverDecidedTie = 'tie'` | `P.tie` | `P.tie` | T / T |
| `no_result` | — | `P.noResult` | `P.noResult` | NR / NR |
| `abandoned` | — | `P.abandoned ?? P.noResult` | same | NR / NR |
| `walkover` | — | `P.walkoverWin ?? P.win` | `P.walkoverLoss ?? P.loss` | W / L |
| `awarded` | winner set | `P.win` | `P.loss` | W / L |
| `awarded` | winner null | `P.noResult` | `P.noResult` | NR / NR |

`form` letters: W, L, T, N (no result, abandoned, awarded without winner), last five counted results in match order (by `completedAt`, then `matchNumber`), most recent last.

### 3.1 Bonus point

`BonusPointRule { kind: 'run_rate_ratio', ratio, points }`: only for `result.type = 'win'` with both regular innings present. The two run rates are the NRR contributions of that match under the stage's `NrrConfig` (`matchNrrContributions`, so the all-out full-quota and par rules apply identically); the winner earns `points` extra when `winnerRR ≥ ratio × loserRR`. If the match is excluded from NRR (contribution null) there is no bonus. `StandingRow.bonusPoints` shows the total; `points` includes it.

## 4. Row aggregation

For each member row:

```
played, won, lost, tied, noResult     from §3 over counted fixtures (inheritsFrom results included)
points          = Σ result points + bonusPoints + pointsAdjustment
pointsAdjustment = Σ active points_adjustment overrides for (stage, pool or null, team)
runsScored, ballsFaced, runsConceded, ballsBowled   = aggregateNrr(...) over counted summaries (NRR-adjusted)
oversFaced, oversBowled   = decimal overs (Σ balls ÷ ballsPerOver per match)
runRate         = runsScored ÷ oversFaced (null when 0)
nrr             = aggregate NRR (null when no NRR-counted match)
matchesRemaining, form
```

Unresolved slot members get zeroed rows and rank after every resolved member, ordered by slot label. Kept predecessors (`keep_for_opponents`) rank normally for display but are flagged and never occupy a qualification slot.

## 5. Tie-break algorithm (`tiebreakers.ts#rankTeams`)

### 5.1 Records

`TeamRecord` per resolved member: points, played, won, lost, tied, noResult, nrr, runsScored, wicketsTaken (NRR-counted innings), seed, name.

### 5.2 Algorithm

The chain is the configured `TieBreakerKind[]` (default `points → nrr → head_to_head → wins → organizer_decision`). Ranking is **sequential refinement without restart**:

```
runs ← [ all records in input (pool) order ]           a run = a group still level
for criterion in chain:
  next ← []
  for run in runs:
    if |run| = 1: next.push(run); continue
    keyed ← evaluate(criterion, run)                    evaluated among THIS run only
    split run into sub-runs of equal key (stable, best first); record separatedBy = criterion
    next.push(...subRuns)
  runs ← next
positions: teams in the same final run share the position of the first of them (sharedPosition)
display order inside a still-level run: input order (never alphabetical)
```

Criterion evaluation:

| Criterion | Key (higher ranks first unless stated) |
|---|---|
| `points` | points |
| `nrr` | NRR via `compareNrr` (`|a − b| < 1e-9` equal; null last) |
| `wins` | won |
| `fewer_losses` | lost (lower first) |
| `runs_scored` | runsScored |
| `wickets_taken` | wicketsTaken |
| `seed` | seed (lower first; null last) |
| `head_to_head` | points in the **mini-league of the run's teams** |
| `head_to_head_wins` | wins in that mini-league |
| `head_to_head_nrr` | NRR over the mini-league matches only |
| `organizer_decision`, `draw_lots` | order of an active `tie_resolution` override whose `orderedTeamIds` set equals the run; none → the run stays level |

### 5.3 Head-to-head mini-league, recursively per run

`ctx.headToHead(teamIds)` builds a fresh table from the counted results **between the given teams only**, with the table's points system and NRR config, and reports `complete` = every pair of those teams has at least one counted result (a no result counts as a result for completeness only if it produced points — i.e. it is a counted fixture).

Because every criterion is evaluated per run, the mini-league is **recomputed for exactly the teams still level at that point**: three teams level on points get a three-team mini-league; if it leaves two of them level, those two proceed to the *next* criterion. To re-apply head-to-head to the residual pair (the pair's own mutual result), list it again: `points → head_to_head → head_to_head → nrr`. The second entry builds a two-team mini-league for the residual run. No hidden restart ever happens, so every separation is explainable by one chain entry.

With `headToHeadRequiresCompleteMiniLeague: true`, a head-to-head criterion whose mini-league is incomplete is **skipped** for that run (the run stays level and moves to the next criterion); the note says "Head-to-head not used: Kings v Titans was not completed."

### 5.4 Decision required vs provisional

`computeStandings` reports every still-level run of size ≥ 2 in `provisionalTies`. `evaluate.ts` moves a run to `unresolvedTies` only when the table is complete (or the tie is mathematically final) **and** the run straddles a slot boundary of a downstream stage (e.g. 2nd and 3rd level with "top 2 qualify"). Before any match everyone is level on 0 points — nothing is reported as a decision.

## 6. Explanation strings (§98)

`TieBreakNote` per row explains why it sits above the next row:

| Situation | `separatedBy` | `detail` |
|---|---|---|
| more points | `null` | "4 pts, 2 ahead of Eagles" |
| NRR | `nrr` | "Ahead of Lions on net run rate (+1.185 vs +0.812)" |
| head-to-head | `head_to_head` | "Ahead of Royals on head-to-head (4 pts vs 2 pts among Kings, Royals, Titans)" |
| H2H skipped | next criterion | "Head-to-head not used: Kings v Titans was not completed. Ahead on net run rate (+0.410 vs +0.120)" |
| organizer | `organizer_decision` | "Placed above Lions by organizer decision (Manual Override: 'Fair play record')" |
| draw of lots | `draw_lots` | "Placed above Lions by draw of lots (seed 58213)" |
| still level | `null` | "Level with Lions — organizer decision required" (unresolved) / "Level with Lions" (provisional) |
| last row | `null` | "" |

The table footnote uses `describeTieBreakerChain`: "Ranking: Points → NRR → Head-to-Head → Most wins → Organizer decision".

## 7. Manual overrides

Applied in this order, all visible as "Manual Override" with their reason:

1. `expunge_results { stageId | null, teamId }` — removes every result involving the team (for both sides) before aggregation; the team's row remains with zeros if it is still a member (withdrawn teams).
2. `points_adjustment { stageId, poolId, teamId, points }` — added to `points` and shown in `pointsAdjustment` ("−2 slow over-rate").
3. `tie_resolution { orderedTeamIds, method, seed }` — consumed by `organizer_decision` / `draw_lots` criteria only for a run whose team set equals `orderedTeamIds`. Draw of lots runs in-app with a recorded seed (`shuffle(teams, mulberry32(seed))`), never hidden randomness. If the level set changes later (a correction), the override no longer matches and the tie reappears as unresolved — the override is not silently re-applied to a different set.

Qualification overrides (`qualify`, `eliminate`, `reassign`, `slot_assignment`, `champion`) do not change tables; see QUALIFICATION_ENGINE §6.

## 8. Uneven pools (§32) — comparison tables

Cross-pool tables (overall, "best runner-up") are built by `evaluate.ts` as additional `computeStandings` calls with `normalization`:

* `raw`: rows compared on their raw figures.
* `per_match_average`: the `points` criterion compares `points ÷ played` (a team with 0 played ranks last); every other criterion unchanged.
* `drop_extra_results`: requires `poolOrder` (final ranked order of every pool). Let `m` = the smallest `played` among the compared teams; for a team from a larger pool, drop its results against the **lowest-placed** opponents of its pool, one at a time, until it has `m` results; points, NRR and every other figure are recomputed without the dropped matches.

Example (10 teams, pools 4/3/3, best runner-up): Lions (Pool A 2nd, 3 played: beat Hawks — A4 —, lost to Tigers, no result v Eagles) 3 pts NRR +0.300; Kings (Pool B 2nd, 2 played: 1 W, 1 L) 2 pts NRR +0.450; Royals (Pool C 2nd) 2 pts NRR −0.100.

| Normalisation | Lions | Kings | Royals | Best runner-up |
|---|---|---|---|---|
| raw | 3 pts | 2 pts | 2 pts | Lions |
| per_match_average | 1.00 | 1.00 | 1.00 → NRR | Kings (+0.450) |
| drop_extra_results | drop win v Hawks → 1 pt (2 played) | 2 pts | 2 pts | Kings (points, then NRR) |

Each normalisation's table is exposed as a `ComparisonTable` (`key` e.g. `position:2:drop_extra_results`) so the qualification explanation can cite it.

## 9. Worked examples

### 9.1 Pool A of the §92 tournament (single RR, 2/1/1/0, chain Points → NRR → Head-to-Head)

Results:

| # | Match | Result |
|---|---|---|
| 1 | Lions 160/6 (20) v Tigers 150/8 (20) | Lions won by 10 runs |
| 2 | Tigers 171/5 (20) v Eagles 140 all out (18.3) | Tigers won by 31 runs |
| 3 | Lions 148/9 (20) v Eagles 149/4 (18.2) | Eagles won by 6 wickets |
| 4 | Hawks 120/9 (20) v Tigers 121/2 (14.0) | Tigers won by 8 wickets |
| 5 | Lions 182/4 (20) v Hawks 130 all out (17.4) | Lions won by 52 runs |
| 6 | Hawks 135/8 (20) v Eagles 136/7 (19.5) | Eagles won by 3 wickets |

NRR inputs (ICC: all-out sides count 120 balls):

| Team | Runs for / balls | Runs against / balls | NRR |
|---|---|---|---|
| Tigers | 442 / 324 | 420 / 360 | 8.1852 − 7.0000 = **+1.185** |
| Lions | 490 / 360 | 429 / 350 | 8.1667 − 7.3543 = **+0.812** |
| Eagles | 425 / 349 | 454 / 360 | 7.3066 − 7.5667 = **−0.260** |
| Hawks | 385 / 360 | 439 / 323 | 6.4167 − 8.1548 = **−1.738** |

(Totals check: runs for = runs against = 1742, balls 1393 = 1393.)

Table:

| Pos | Team | P | W | L | NR | Pts | NRR | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | Tigers | 3 | 2 | 1 | 0 | 4 | +1.185 | Ahead of Lions on net run rate (+1.185 vs +0.812) |
| 2 | Lions | 3 | 2 | 1 | 0 | 4 | +0.812 | Ahead of Eagles on net run rate (+0.812 vs −0.260) |
| 3 | Eagles | 3 | 2 | 1 | 0 | 4 | −0.260 | 4 pts, 4 ahead of Hawks |
| 4 | Hawks | 3 | 0 | 3 | 0 | 0 | −1.738 | |

With the chain Points → Head-to-Head → NRR the result is the same: the three-team mini-league is a cycle (Lions beat Tigers, Tigers beat Eagles, Eagles beat Lions: 2 pts each), head-to-head separates nobody, and NRR decides. Tigers and Lions take A1 and A2.

### 9.2 Head-to-head decides (6-team pool, chain Points → Head-to-Head → NRR)

Kings, Royals and Titans finish on 6 pts. Mutual results: Kings beat Royals, Kings beat Titans, Royals beat Titans. Overall NRR: Titans +0.900, Royals +0.400, Kings +0.100.

* Mini-league of the run {Kings, Royals, Titans}: Kings 4, Royals 2, Titans 0 → order Kings, Royals, Titans; notes "Ahead of Royals on head-to-head (4 pts vs 2 pts among Kings, Royals, Titans)".
* With Points → NRR → Head-to-Head the order is Titans, Royals, Kings.
* If Kings v Titans had been a no result: mini-league Kings 3, Royals 2, Titans 1 (still decisive). With `headToHeadRequiresCompleteMiniLeague: true` and Kings v Titans **not played** (e.g. cancelled), the criterion is skipped and NRR orders them Titans, Royals, Kings.

### 9.3 Points table with custom points

Points 3/1/1/0, walkover 3/0, abandoned 1, bonus `{run_rate_ratio 1.25, 1}`. Lions: beat Kings 180/4 v 120 all out (bonus: 9.00 ≥ 1.25 × 6.00 = 7.50 → +1) = 4; walkover over Titans = 3; abandoned v Royals = 1; `points_adjustment −1` (slow over-rate) → **7 pts** (P 3, W 2, NR 1, bonus 1, adjustment −1).

## 10. Tests

Acceptance list: [CONTRACTS.md](../CONTRACTS.md) WP-tournament-standings. Golden tests from this document: §9.1 table incl. NRR values and notes, §9.2 all four variants, §9.3 points, §8 uneven-pool normalisations, H2H chain entries repeated, tie resolution not applied to a changed level set.
