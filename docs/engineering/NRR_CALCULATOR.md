# Net Run Rate Calculator Design

Engineering design for §41: `src/domain/tournament/nrr.ts` (owner WP-tournament-standings) — the **only** place NRR is computed (D9). Consumers: standings (`computeStandings`), the bonus point rule, what-if and impact previews, tournament statistics. Input is `MatchSummary` only; configuration is `NrrConfig` (stage override ?? tournament default).

Contents: 1 formula · 2 ball-count arithmetic · 3 per-match contributions · 4 inclusion rules · 5 aggregation and comparison · 6 worked examples · 7 display · 8 tests.

---

## 1. Formula

```
NRR = (Σ runs scored ÷ Σ overs faced) − (Σ runs conceded ÷ Σ overs bowled)
overs of one innings = legal balls ÷ ballsPerOver of that innings
```

Overs are never the display notation: 17.3 overs is 105 balls = 17.5 overs, not 17.3. `computeNrr(runsFor, oversFor, runsAgainst, oversAgainst)` returns null when either overs total is 0.

## 2. Ball-count arithmetic

All summary figures are integers (`runs`, `legalBalls`, `allottedBalls`, `ballsPerOver`). To avoid accumulating floating-point error and to support mixed over lengths, aggregation works in **integer ball units** over a common denominator:

```
L = lcm of the ballsPerOver values involved (≤ lcm(1…12) = 27720; usually 6)
units(innings) = balls × (L ÷ ballsPerOver)                 integer
oversFor      = Σ unitsFor ÷ L
NRR           = runsFor × L ÷ ΣunitsFor − runsAgainst × L ÷ ΣunitsAgainst
```

Only the two final divisions are floating point. `NrrContribution.oversFor` / `TeamNrrAggregate.oversFor` expose the decimal value for display; `ballsFor` exposes adjusted balls when a single `ballsPerOver` applies.

Example (mixed): a school team faced 120 balls in a 6-ball match and 80 balls in an 8-ball match. L = 24: units = 120 × 4 + 80 × 3 = 720 → 720 ÷ 24 = **30 overs** (20 + 10). 220 runs → 7.333 per over.

## 3. Per-match contributions (`matchNrrContributions`)

For a counted match with regular innings `i0` (side batting first, S1) and `i1` (chasing side, S2):

| Situation | S1 for (runs / balls) | S2 for (runs / balls) | Mode |
|---|---|---|---|
| normal innings | `i0.runs / i0.legalBalls` | `i1.runs / i1.legalBalls` | both |
| innings all out (`allOut`: `all_out` or `batters_unavailable`) | balls replaced by that innings' `allottedBalls` (after revision) | same rule | `icc` only |
| chase won early | actual `i1.legalBalls` | | both |
| revised target (`i1.targetRevised`), `revisedTarget: 'icc_par'` | `(i1.target − 1) / i1.allottedBalls` | actual (all-out rule applies) | both |
| terminated chase (`completion: terminated`, par = target − 1), `icc_par` | `(i1.target − 1) / i1.allottedBalls` (= balls bowled) | actual | both |
| `revisedTarget: 'actual'` | raw figures | raw | both |

Each team's **against** figures are the opponent's **for** figures (symmetric), so Σ runs scored = Σ runs conceded across a table. `actual_overs` mode never applies the all-out full quota. Super-over innings (`summary.superOvers`) are never read.

## 4. Inclusion rules

| Result | Default (ICC) | Configurable |
|---|---|---|
| win / tie (incl. decided ties) | counted | — |
| `no_result` | excluded | `includeNoResult: true` → every regular innings with ≥ 1 legal ball counts (all-out rule still applies; a side that did not bat contributes 0 / 0) |
| `abandoned` | excluded | `includeAbandoned: true` → same rule |
| `walkover` | excluded | `walkover: { kind: 'notional', winnerRuns, winnerBalls, loserRuns, loserBalls }` → credited as winner for `winnerRuns / winnerBalls`, against `loserRuns / loserBalls` (and mirrored for the loser) |
| `awarded` | excluded | `awarded: 'use_played_innings'` → completed regular innings are counted |
| teams with an active `expunge_results` override | match excluded for **both** teams | — |
| cancelled fixtures | never have a summary | — |

`matchNrrContributions` returns null for an excluded match; the standings row's `nrr` is null until the team has a counted match.

## 5. Aggregation and comparison

* `aggregateNrr(summaries, teamIds, config, {restrictToTeams, expungedTeamIds})` sums contributions per team (`matchesCounted`), in integer units per §2. `restrictToTeams: true` counts only matches between listed teams — used for `head_to_head_nrr` mini-leagues.
* `compareNrr(a, b)`: null sorts last; `|a − b| < NRR_EPSILON (1e-9)` is equal so the next tie-breaker decides; ranking always uses the unrounded value.

## 6. Worked examples

All 6-ball overs, 20 overs unless stated. Values rounded to 3 dp only for display.

### 6.1 Plain win
A 180/6 (20) beat B 160/9 (20). A: 180/20 − 160/20 = 9.000 − 8.000 = **+1.000**; B **−1.000**.

### 6.2 All out and a chase won early
A 150 all out in 18.2 (110 balls); B 151/3 in 15.4 (94 balls).

| Mode | A | B |
|---|---|---|
| `icc` (A faced 120 balls) | 150 × 6/120 − 151 × 6/94 = 7.500 − 9.638 = **−2.138** | **+2.138** |
| `actual_overs` | 150 × 6/110 − 9.638 = 8.182 − 9.638 = **−1.456** | **+1.456** |

### 6.3 Tournament aggregate with a no result
Team T:
* M1: T 165/7 (20) beat X 140/8 (20);
* M2: T 142 all out (19.1 = 115 balls) lost to Y 143/5 (17.3 = 105 balls);
* M3: T 60/1 (8.0) v Z, rain, no result, Z did not bat.

Default config (no result excluded): for 307 off 240 balls (40 overs; the all-out innings counts 120); against 283 off 225 balls (37.5 overs). NRR = 307 × 6/240 − 283 × 6/225 = 7.675 − 7.547 = **+0.128**.
The classic mistake of dividing by 37.3 "overs" gives +0.088 — ball-count arithmetic prevents it.
With `includeNoResult: true`: for 367 off 288 balls → 7.646 − 7.547 = **+0.099**.

### 6.4 Reduced-overs match
Reduced to 12 overs a side before play (`allottedBalls 72`). A 96/4 (12); B 80 all out in 10.1 (61 balls). ICC: B counts 72 balls. A: 96/12 − 80/12 = 8.000 − 6.667 = **+1.333**; B **−1.333**.

### 6.5 Revised target, chase played out
A 180/6 (20). Rain: B's chase revised to 15 overs (90 balls), target 141. B 138/4 (15) → A won by 2 runs (revised target).

| Config | A | B |
|---|---|---|
| `icc_par` (A credited with 140 off 90 balls) | 140 × 6/90 − 138 × 6/90 = 9.333 − 9.200 = **+0.133** | **−0.133** |
| `actual` | 180/20 − 138/15 = 9.000 − 9.200 = **−0.200** | **+0.200** |

`actual` would give the winner a negative NRR from a match it won — the reason `icc_par` is the default.

### 6.6 Terminated chase decided on par
A 180/6 (20). B 131/3 at 14.2 (86 balls) when play is abandoned; `overs_revised { terminal, maxBalls 86, target 111 }` → par 110, B won by 21 runs (par score).

| Config | A | B |
|---|---|---|
| `icc_par` (A credited with 110 off 86) | (110 − 131) × 6/86 = **−1.465** | **+1.465** |
| `actual` | 180/20 − 131 × 6/86 = 9.000 − 9.140 = **−0.140** | **+0.140** |

### 6.7 Super over
A 150/7 (20), B 150/9 (20), B wins the super over. NRR counts only the regular innings: both 150/20 − 150/20 = **0.000**; super-over runs are ignored.

## 7. Display

`formatNrr` (scoring/format.ts): 3 dp with explicit sign (`+1.185`, `-0.260`, `0.000`), `–` for null; rounding half away from zero on the absolute value. Standings show "Overs faced / bowled" from `oversFaced` / `oversBowled` via `formatOvers` of the adjusted balls when all matches share one ball count, else as decimal overs with one decimal.

## 8. Tests

Every example in §6 as golden tests (both modes where shown); symmetry (Σ runs for = Σ runs against, Σ units for = Σ units against over a table); epsilon comparison; expunged team exclusion; walkover notional; awarded `use_played_innings`; 8-ball and mixed matches; stale summaries (not in `snapshot.summaries`) never counted.
