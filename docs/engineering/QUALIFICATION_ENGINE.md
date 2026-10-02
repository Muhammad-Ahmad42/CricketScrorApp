# Qualification Engine Design

Engineering design for §44–§47, §51, §98: `src/domain/tournament/qualification.ts` (`resolveStageSlots`, `computeQualification`, `resolveChampion`; owner WP-tournament-standings), fed by slot expansion in `slots.ts` and knockout advancement in `knockout.ts` ([TOURNAMENT_RULES_ENGINE.md §7–§8](TOURNAMENT_RULES_ENGINE.md)). Tables come from [STANDINGS_CALCULATOR.md](STANDINGS_CALCULATOR.md).

Contents: 1 model · 2 slot sources · 3 slot resolution · 4 best-of-position across uneven pools · 5 mathematical certainty · 6 manual override precedence · 7 knockout advancement and champion · 8 explanation text · 9 worked examples · 10 tests.

---

## 1. Model

* **Rules describe, slots decide.** `StageConfig.entryRules` (`QualificationRule[]`) are the human description ("Top 2 from each pool"); `expandEntryRules` turns them into `StageSlot`s with typed `SlotSource`s. Slots are authoritative and individually editable (`slot_change`).
* **Two slot roles.** `entry` slots define a stage's entrants — a team occupies at most one entry slot per stage. `progression` slots carry knockout progression inside a stage ("Winner SF1") and are exempt from the one-slot rule.
* **Outputs** per stage (`StageEvaluation`): `slots: SlotResolution[]` (who is in each slot now: `final` / `provisional` / `pending`) and `qualification: TeamQualification[]` (each team's status towards every downstream stage, with certainty and explanation).

## 2. Slot sources

| Source | Reads | `final` when |
|---|---|---|
| `pool_position {stage, pool, position}` | the pool's ranked table | pool complete, or the position is mathematically locked (§5) |
| `best_of_position {stage, position, rank, normalization}` | comparison table of every pool's position-p team (§4) | every pool complete, or locked by enumeration |
| `overall_position {stage, rank, normalization}` | combined table of all pools | stage complete, or locked |
| `bracket_winner / bracket_loser {stage, round, position}` | the `main` fixture at (round, position) via `knockoutAdvancer`; a bye position → the bye entrant (§7.2) | that fixture's match is terminal with a determined advancer |
| `fixture_winner / fixture_loser {fixture}` | that fixture via `knockoutAdvancer` (custom page playoffs) | same |
| `manual {teamId}` | the team (direct entries included) | team set |

`pending` = source has no counted result yet (an empty table, an unplayed fixture); `provisional` = current state only.

## 3. Slot resolution (`resolveStageSlots`)

```
placed ← {}                                               team → slot (entry slots of this stage only)
1. pinned: every active slot_assignment → slot := team (final, viaOverride); qualification.qualify → slot := team
2. eliminated ← teams with an active qualification.eliminate for this stage
3. for slot in entry slots by index, skipping slots filled in step 1:
     candidates ← ranked candidate list of the source (table rows in rank order, comparison table, advancer)
     start at the source's rank (position p / rank r), walk down to the first candidate that is
        a resolved team, membership active, not eliminated, not in placed
     slot := that team; placed[team] := slot
     status := min(source status, status of any earlier slot whose claim moved this walk)
4. progression slots: advancer of their fixture (no one-slot rule, no eliminate filter)
```

* **Walk down, not re-rank.** For `top_per_pool 2`, A1 takes row 1 and A2 row 2. If Tigers (row 1) are already placed by an override into another slot, A1 walks to Lions (row 2) and A2 walks to Eagles (row 3) — "the next eligible team moves up".
* **Status propagation.** A slot whose walk skipped a team placed by a provisional earlier slot is itself at most provisional.
* **Explanation** per slot: "Pool A winner: Tigers (4 pts, NRR +1.185)", "1st overall: Lions — Tigers already qualified as Pool A winner", "Winner SF1: Lions (won by 12 runs)", "Winner SF1: to be decided by the organizer (semifinal tied)".
* **Frozen sides.** Resolutions feed only fixtures without a match. A played fixture keeps `matchSides`; if its slot's occupant later changes, impact reports a `SlotChange` with `playedFixtureIds` — accept (results stand as played) or pin the old occupant with `slot_assignment`.

## 4. Best-of-position across uneven pools

`best_of_position {position p, rank r, normalization}` compares the p-th placed team of every pool in a `ComparisonTable` built with the stage's tie-break chain under the chosen normalisation (`raw`, `per_match_average`, `drop_extra_results`; definitions in STANDINGS_CALCULATOR §8). The table's key (`position:2:per_match_average`) is cited in explanations.

Example — 10 teams in pools of 4/3/3, rule "pool winners + best runner-up":

| Runner-up | Played | Record | Pts | NRR |
|---|---|---|---|---|
| Lions (A) | 3 | W v Hawks (A4), L v Tigers, NR v Eagles | 3 | +0.300 |
| Kings (B) | 2 | 1 W, 1 L | 2 | +0.450 |
| Royals (C) | 2 | 1 W, 1 L | 2 | −0.100 |

* `raw` → Lions (3 pts). Explanation: "Lions are the best runner-up: 3 pts, ahead of Kings (2 pts)."
* `per_match_average` → all 1.00 pts/match → NRR → Kings. "Kings are the best runner-up: 1.00 pts per match, level with Lions and Royals, ahead on net run rate (+0.450)."
* `drop_extra_results` → Lions' win over the Pool A bottom team is dropped → Lions 1 pt from 2 → Kings. "Kings are the best runner-up (results against each 4-team pool's last team are not counted)."

The wizard warns when pools are uneven and the stage uses a cross-pool source with `raw` (§32: "Teams in different pools may play different numbers of matches.").

## 5. Mathematical certainty (`computeQualification`)

For each team and each downstream target stage T (every stage with an entry slot sourced from this stage — Cup and Plate are both targets):

* `qualified / mathematical` — in every possible completion of the remaining fixtures the team occupies an entry slot of T;
* `eliminated / mathematical` — in no completion can it occupy one;
* otherwise `in_contention` (`provisional` certainty); after the stage completes every status is final. Overrides give `certainty: 'manual'` (§6).

### 5.1 Scope

Only fixtures that can change the relevant table matter: for `pool_position` sources, the pool's undecided fixtures (not terminal, not cancelled); for `best_of_position` / `overall_position`, the undecided fixtures of every pool involved. Pools that never share a cross-pool source are enumerated independently.

### 5.2 Outcome sets

Each undecided fixture's outcome set is derived from its effective `PointsSystem`: side A win, side B win, either win + bonus, tie, decided tie under `win_loss`, no result, abandoned, either walkover — each mapped to the **observable tuple** (points A, points B, and the W/L/T/NR deltas used by criteria in the chain's decisive prefix, §5.3), then deduplicated. With default 2/1/1/0 points and a Points → NRR → … chain the observable tuple is only the points, so the set is {(2,0), (0,2), (1,1)}: 3 outcomes per fixture.

### 5.3 Deciding a scenario

Margins are unknown in a hypothetical scenario, so the chain is split into a **decisive prefix** — criteria fully determined by outcomes (`points`, `wins`, `fewer_losses`, `head_to_head`, `head_to_head_wins`, `seed`) up to the first margin- or organizer-dependent criterion (`nrr`, `head_to_head_nrr`, `runs_scored`, `wickets_taken`, `organizer_decision`, `draw_lots`) — and the rest. Within a scenario:

* rank by the decisive prefix exactly;
* for a team's **worst case**, it loses every remaining level group (placed last in its run);
* for its **best case**, it wins every level group (placed first).

The team is `qualified` if its worst-case placement gets a slot in **every** scenario; `eliminated` if its best-case placement gets none in **any** scenario.

### 5.4 Enumeration and the complexity cap

```
f ← undecided fixtures in scope; k_i ← |outcome set of fixture i|
if f ≤ enumerationLimit (default 8):
   depth-first over the product of outcome sets, applying each outcome to integer counters (undo on backtrack)
   per team keep flags {canQualify, canMiss}; stop early once every team has both flags (all in contention)
else: bounds (§5.5)
```

Cost with the defaults: 3⁸ = 6 561 scenarios × ranking a 4–6 team pool (≈ 2 µs) ≈ 15 ms. Early termination usually ends much sooner. Because the contract caps on the number of fixtures, a points system whose outcome set does not collapse (bonus + abandoned + walkover points all distinct → up to 9 tuples, 9⁸ ≈ 43 million) must also be capped on **scenario count**: the implementation falls back to bounds when Π k_i > 65 536, which keeps the evaluation budget (< 100 ms).

### 5.5 Fallback bounds (sound, may say "in contention" instead of a certain answer)

For a slot boundary "top k of this pool":

```
maxPts(u) = current points(u) + Σ over u's undecided fixtures of the largest points u can earn (incl. bonus)
minPts(u) = current points(u) + Σ of the smallest points u can earn (loss / walkover loss)
qualified(t)  ⇐ |{u ≠ t : maxPts(u) ≥ minPts(t)}| ≤ k − 1          (ties counted against t)
eliminated(t) ⇐ |{u ≠ t : minPts(u) > maxPts(t)}| ≥ k               (ties counted for t)
```

Rivals playing each other are treated independently (conservative). For cross-pool sources above the limit, certainty is claimed only when it follows from per-pool certainty (a team certain to finish top k of its pool with k ≥ p is certain for a `pool_position ≤ p` slot); otherwise the status stays `in_contention`.

## 6. Manual override precedence

Highest first; every override is shown as "Manual Override" with its reason and audited (§47).

1. **Frozen sides** — nothing rewrites a fixture that has a match.
2. **`champion`** — decides `ChampionResult` (`manual`, or `shared` with several teams).
3. **`slot_assignment`** — pins a slot to a team (`viaOverride`, `final`).
4. **`qualification.qualify {slotId}`** — places the team; the displaced automatic occupant takes part in the walk for the remaining slots.
5. **`qualification.reassign {slotId | poolId}`** — moves the team into another slot / pool of the target stage.
6. **`qualification.eliminate`** — removes the team from every automatic entry slot of the stage (the next team moves up).
7. **Table overrides** (`expunge_results`, `points_adjustment`, `tie_resolution`) — act inside standings, before resolution.
8. Automatic resolution.

Conflicts among active overrides for the same slot: the most recently created wins; the older one is listed in the slot view as "superseded" until revoked. `TeamQualification.override` carries the override that decided the team's status; `certainty` becomes `manual`.

## 7. Knockout advancement and champion

### 7.1 Advancement

`bracket_winner / bracket_loser / fixture_winner / fixture_loser` resolve through `knockoutAdvancer` (TOURNAMENT_RULES_ENGINE §7) with the fixture's frozen sides: `result`, `walkover`, `awarded`, `tie_decider` → `final`; `higher_seed` → `final` with the explanation "Tigers advance as the higher seed (semifinal abandoned)"; `organizer_required` → `pending` with a call to action ([Decide winner] → `slot_assignment`); `not_played` → `pending`, provisional nothing.

### 7.2 Bye positions

A `knockout_winners` entry slot (or progression slot) may reference a round-1 position that has no fixture because it was a bye. Resolution maps the position to seeds `order[2i]`, `order[2i+1]` of `standardBracketOrder(P)`; the one ≤ n is the bye entrant, identified through the entry slot whose `seed` equals it. The explanation reads "Winner QF (bye): Tigers".

### 7.3 Champion (`resolveChampion`)

Only the stage with `StageConfig.decidesChampion` (a Plate ordered last never produces the champion):

1. active `champion` override → its team(s), basis `manual` (or `shared`);
2. knockout / custom: the `isFinal` fixture's advancer — `final` basis with the winner; `shared` (`noResult: 'shared'`) → both teams; `organizer_required` → null until a `champion` override;
3. league / single-pool group: top of the complete table (`league_table`); an unresolved tie at the top → null ("Organizer decision required for the title").

Services write `tournaments.champion_json` from this result whenever it can change.

## 8. Explanation text (§98)

`TeamQualification.explanation` is always a full sentence; the standings screen shows it next to every row.

| State | Template | Example |
|---|---|---|
| qualified, mathematical | "{team} have mathematically qualified for the {stage} as {slot label} ({rule}; {chain})." | "Tigers have mathematically qualified for the Semifinal as Pool A winners (Top 2 from each pool; Points → NRR → Head-to-Head)." |
| qualified, provisional (stage complete counts as mathematical) | "{team} currently hold {slot label} for the {stage}." | "Lions currently hold A2 for the Semifinal." |
| in contention | "{team} are still in contention for the {stage}." + need hint when cheap | "Eagles are still in contention for the Semifinal. A win against Hawks keeps them level with Lions on points." |
| eliminated, mathematical | "{team} can no longer qualify for the {stage}." | "Hawks can no longer qualify for the Semifinal." |
| parallel targets | "{team} are out of the {A} but have qualified for the {B} as {slot}." | "Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd." |
| manual | "{team} {qualified for / were eliminated from} the {stage} by Manual Override: '{reason}'." | "Royals qualified for the Semifinal by Manual Override: 'Kings withdrew'." |
| decision required | "{team} and {team} are level for {slot}: organizer decision required." | "Tigers and Lions are level for A2: organizer decision required." |

The stage header adds the rule and chain from `explainEntryRules` and `describeTieBreakerChain`. The need hint is produced only from the enumeration (the smallest set of own results that yields `canQualify` in the worst case); above the cap it is omitted rather than guessed.

## 9. Worked examples

### 9.1 Certainty mid-stage

Pool A (4 teams, single RR, top 2 to the Semifinal, 2/1/1/0, chain Points → NRR → H2H) after four matches: Tigers 4 pts (2 played), Lions 2, Eagles 2, Hawks 0. Remaining: Tigers v Hawks, Lions v Eagles. Decisive prefix = [points]; outcome sets {(2,0),(0,2),(1,1)} → 9 scenarios.

| Team | Worst case | Best case | Status |
|---|---|---|---|
| Tigers | lose to Hawks: 4 pts; Lions/Eagles winner also 4 → level, placed 2nd | 1st | **qualified (mathematical)** — at most one other team can reach 4 |
| Lions | lose: 2 pts, Eagles 4, Tigers ≥ 4 → 3rd or lower | beat Eagles: 4 pts, level with Tigers → 1st | in contention |
| Eagles | symmetric to Lions | | in contention |
| Hawks | | beat Tigers: 2 pts; Lions and Eagles tie → both 3; or one wins → 4 → Hawks at best level 3rd | **eliminated (mathematical)** |

Texts: "Tigers have mathematically qualified for the Semifinal." · "Lions are still in contention for the Semifinal. A win against Eagles guarantees qualification." · "Hawks can no longer qualify for the Semifinal."

### 9.2 One entry slot per team

Stage entry rules `[pool_position A 1, top_overall 2]` (A1, 1st overall, 2nd overall). Overall table: Tigers (A), Kings (B), Lions (A). A1 = Tigers; "1st overall" walks past Tigers (placed) to Kings; "2nd overall" walks to Lions. Explanation "1st overall: Kings — Tigers already qualified as Pool A winner".

### 9.3 Correction after the semifinal (frozen sides)

§92 tournament: SF1 (A1 Tigers v B2 Royals) played, Tigers won. A group result is then corrected so Lions become A1. The impact preview shows `SlotChange { A1: Tigers → Lions, playedFixtureIds: [SF1] }`; SF1 keeps Tigers v Royals, "Winner SF1" stays Tigers, the final and champion are unchanged. The slot view shows "A1: Lions (conflict — SF1 was played by Tigers)". The organizer may accept (results stand) or pin Tigers to A1 with `slot_assignment`.

## 10. Tests

Acceptance list: [CONTRACTS.md](../CONTRACTS.md) WP-tournament-standings (qualification and certainty items). Golden tests from this document: §9.1 statuses and texts, §4 three normalisations, §9.2 walk-down, §9.3 frozen sides, bye-position resolution (§7.2), scenario cap fallback with a 9-outcome points system, override precedence conflicts, champion from a `decidesChampion` stage that is not last.
