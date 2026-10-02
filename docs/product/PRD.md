# Scorebook — Product Requirements Document (PRD)

| | |
|---|---|
| Product | Scorebook: offline cricket scorer and tournament manager |
| Document | PRD (§4 phase 1 "Planning", §102 product item 1) |
| Status | Baseline for V1 (MVP). Matches the frozen WP-0 architecture contract |
| Sources | [SPEC.md](../SPEC.md) (§N references), [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), [CONTRACTS.md](../CONTRACTS.md), [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md) |
| Companion product docs | [PERSONAS.md](PERSONAS.md) · [USER_STORIES.md](USER_STORIES.md) · [REQUIREMENTS.md](REQUIREMENTS.md) · [BUSINESS_RULES.md](BUSINESS_RULES.md) · [EDGE_CASES.md](EDGE_CASES.md) |

---

## 1. Problem

Most amateur cricket in schools, clubs, universities and weekend groups is still scored either in a paper book or in apps that need an account, a data connection and adverts, and that have one fixed idea of what a match or tournament looks like. That causes six recurring problems:

1. **Scoring breaks when the network does.** Grounds often have weak or no signal. Cloud-first apps stall, lose balls, or refuse to start.
2. **One mistake spoils the rest of the match.** A mis-tapped four at 17.3 usually means crossing out and re-adding by hand, and every later bowling figure, partnership and the result can end up wrong.
3. **Tournaments rarely fit the template.** Real competitions have 10 teams in 4/3/3 pools, a team that withdraws in week 3, a washed-out semifinal, a points deduction for a late start, and "best two runners-up" qualification. Rigid apps can't handle these, so organizers fall back to spreadsheets.
4. **Wrong NRR and qualification cause disputes.** Hand-calculated net run rate (all-out rule, reduced overs) and qualification ("have we mathematically qualified?") are where most league disputes start.
5. **A dead phone can mean a lost match.** A battery that runs out at 16.4 overs must not cost the match.
6. **Recording "why" is as important as the numbers.** When a result is corrected or a team is moved between pools, organizers need a record of what changed and why.

## 2. Product vision (§1, §100)

A digital cricket scorebook that looks like a traditional scorebook, works with the precision of modern sports software, and becomes a complete tournament manager when needed. It must be:

* simple at first glance,
* extremely fast while scoring,
* powerful for tournament management,
* safe for corrections,
* informative for analytics,
* flexible for setup,
* fully usable with no internet, no account and no cost.

Both modes use **the same scoring engine**:

* **Mode 1: Single match.** Create and score one match.
* **Mode 2: Tournament.** Teams, stages, pools, fixtures, standings, NRR, qualification, knockouts, statistics and organizer overrides.

A tournament fixture opens exactly the same scoring engine as a standalone match (§66).

## 3. Goals and non-goals

### 3.1 Goals (V1)

| # | Goal | Measured by (see §8) |
|---|---|---|
| G1 | A normal delivery is recorded with **one tap** and appears on screen immediately | SC-U1, SC-P1 |
| G2 | **No committed ball is ever lost**: after a crash, battery loss or force-close the match resumes exactly where it was | SC-R1–SC-R3 |
| G3 | **Every figure comes from one engine.** The score, cards, partnerships, result, standings, NRR and qualification are all derived from the delivery log. Nothing is calculated separately in two places. | SC-Q1, SC-Q2 |
| G4 | **Corrections are safe.** Any past ball can be edited, and dependent data (cards, result, standings, NRR, qualification) is recomputed, with a WHAT WILL CHANGE preview and an audit trail. | SC-Q3 |
| G5 | **Tournament rules are configuration, not code.** Points, NRR mode, tie-breaker order, qualification rules, pool sizes and knockout policy are all configurable. | SC-F2 |
| G6 | **Automation explains itself and the organizer can override it** (§54, §98) | SC-F3 |
| G7 | **Usable outdoors, one-handed and accessibly** (§72, §78) | SC-A1–SC-A3 |
| G8 | **Zero cost and zero cloud.** No account, backend, tracking or ads. Data leaves the device only when the user exports it. | SC-F4 |

### 3.2 Non-goals (V1)

| Non-goal | Why / what we do instead |
|---|---|
| Computing DLS / DLS Standard Edition targets | DLS is proprietary. Organizers type a revised target or par (the app can suggest an average-run-rate target via `suggestRevisedTarget`), and results read "(revised target)" or "(par score)", never "(DLS method)". Open question 5 and 10 in CONTRACTS.md. |
| Multi-innings matches (Tests, two-day games, follow-on) | The model has regular innings 0 (first innings) and 1 (the chase), plus super-over innings. Declarations are supported only as an innings end. |
| Cloud sync, accounts, multi-device live scoring | §85. Data moves between devices only as a JSON backup file (§84). Multi-scorer and device-to-device transfer are §96 future work. |
| Ball-tracking, wagon wheels, pitch maps, commentary | Not required by §9–§21. Commentary is §96 future work. |
| Player career statistics across tournaments or teams | §96. Players belong to a home team and can guest for other teams in individual matches. Tournament statistics are V1 (§52). |
| Full (concussion / like-for-like) replacements that are enforced | V1 enforces substitute **fielders** only (`MatchPlayer.isSubstitute`). A full replacement is added as an ordinary squad member (open question 8). |
| Fielding-restriction checks during powerplays | Powerplays are reported (phase status and totals) but fielding positions are not scored. |
| Scheduling optimization, rest-day constraints | §96. V1 has an optional sequential scheduler (`scheduleSequential`) and manual dates. |

## 4. Target users

Full personas are in [PERSONAS.md](PERSONAS.md). The five primary segments are:

| Segment | Persona | Uses mostly |
|---|---|---|
| Club scorers | Imran, club scorer (P1) | Mode 1 and tournament fixtures; live scoring, scorecard PDF, corrections |
| School sports staff | Nadia, PE teacher running an inter-house tournament (P2) | Short junior formats, uneven sides, mandatory retirement, simple league plus final |
| University sports departments | Rahul, university sports officer (P3) | Large groups-to-knockout tournaments, uneven pools, qualification rules, overrides, audit |
| Casual weekend groups | Bilal, organizer of a Sunday tape-ball group (P4) | Fast setup, custom overs, last man stands, players added mid-match |
| League statisticians | Margaret, district league statistician (P5) | Standings, NRR, tie-breakers, points adjustments, walkovers, backups and imports, audit |

Anti-persona: a professional broadcast or international scorer who needs DLS, ball-tracking or live data feeds. We don't design for them.

## 5. Scope

### 5.1 MVP (V1). Everything in §95 plus what the frozen contract already commits to

**Match (Mode 1 and the shared engine)**

| Area | Included in V1 | Spec |
|---|---|---|
| Match setup | Title, teams (library or new), venue, date/time, format preset T5/T10/T20/T30/T40/T50/custom, any number of overs (quick picks 1, 2, 5, 6, 10, 20, 25, 30, 40, 50 or a typed number such as 17), balls per over 1–12, players per side 2–15, per-team side size (e.g. 8 v 7), squads including substitute fielders and players added on the fly, toss (optional), openers and opening bowler | §6–§8, §64 |
| Rules as data | Wide and no-ball penalty runs and whether they count as a ball, free hit, powerplays, bowler quota (`uniform` ⌈overs ÷ 5⌉ or `icc_one_fifth`), consecutive-overs rule, last man stands, super over (overs, wickets, what happens if tied again, maximum rounds, repeat-player restriction), advisory mandatory retirement | §17, §20, §21 |
| Live scoring | One tap per normal ball (`0 1 2 3 4 6`), extras sheet (WD+n, wide to the boundary, NB + bat, bye or leg-bye runs, byes, leg-byes, custom values, overthrows, short runs), wicket sheet (all 9 delivery dismissals plus off-ball run out / timed out / obstructing, retirements), strike rotation, manual swap strike, bowler prompts with eligibility reasons, current-over strip, header with score, overs, CRR, RRR, target, runs required and balls remaining | §9–§13, §17–§19 |
| Match events | Penalty runs (Law 41), overs revision (planned or current innings, revised target, rain-terminated chase on a par score), play suspended/resumed, declaration, batters unavailable (absentees), super overs, walkover, abandoned, no result, awarded | §7, §21, §22 |
| Corrections | Unlimited undo by action (a wicket and its incoming batter undo together), redo within the session, historical edit of any ball with a preview, re-stamping and audit | §15, §16 |
| Recovery | Every ball committed atomically and durably. Startup prompt MATCH IN PROGRESS with RESUME / SAVE & EXIT / DISCARD. Projection rebuild. `needsRepair` guard. | §23, §59, §89 |
| Outputs | Scorecard (batting, bowling, extras, fall of wickets, partnerships, over summary), analytics (worm, Manhattan, partnerships), match history (search, filter, sort, delete), offline PDF scorecard, share sheet | §64, §81, §83 |

**Tournament (Mode 2)**

| Area | Included in V1 | Spec |
|---|---|---|
| Creation wizard | Info → teams (with optional seeds) → structure or template → rules → pools → fixtures → review. Each step is saved as it is completed, so an interrupted wizard can be resumed. | §25, §26, §65 |
| Structures | League, groups, knockout, groups + knockout, custom multi-stage (e.g. Group → Super 8 → SF → Final), parallel Cup/Plate stages, direct entries to later stages, 5 built-in templates, save as template | §28, §29, §56 |
| Pools | Random (normal or seeded, e.g. 847291), seeded snake, manual, uneven sizes with a warning, slot-built pools (Super 8 from A1/B2…), per-pool legs | §30–§32 |
| Team changes | Move, swap and replace (with a choice of what happens to prior results), withdraw (walkover or cancel remaining fixtures, optional expunge), seed changes, with a WHAT WILL CHANGE preview | §33, §34 |
| Fixtures | Single, double or n-leg round robin, knockout bracket with byes and a third-place play-off, manual "+ Add Match", generate → preview → edit → confirm, editing, postpone / reschedule / cancel / restore, replay of an abandoned fixture | §35–§39 |
| Rules | Points (win/tie/NR/loss, abandoned, walkover, how a decided tie counts, bonus point), NRR (ICC or actual overs, NR / abandoned / walkover / awarded / revised-target policy), ordered tie-breakers (12 kinds) | §40–§43 |
| Qualification | Rule builder (top N per pool, pool position, best of position, top N overall, knockout winners, manual, direct entry), slots, uneven-pool normalisation, qualification status with certainty and plain-language explanations, and what-if (engine plus screen, see note below) | §44, §45, §48, §51, §98 |
| Knockouts | Fixed cross-pool, random or ranking seeding; tie policy (super over / higher seed / organizer); no-result policy (higher seed / replay / organizer / shared); frozen sides once a match starts; champion from the stage marked `decidesChampion` | §46 |
| Overrides and audit | Manual qualify / eliminate / reassign, points adjustment, tie resolution (organizer decision or recorded draw of lots), slot assignment, expunge, champion. Every override is labelled "Manual Override", needs a reason, can be revoked and is audited. | §47, §53, §54 |
| Views | Dashboard (name, stage, progress 24/48, next match, standings, recent results), standings with pool tabs and overall table, bracket, statistics, audit log, tournament PDF | §49–§52, §80, §82 |

**Platform**

| Area | Included in V1 | Spec |
|---|---|---|
| Data | SQLite with foreign keys, STRICT tables, forward-only migrations, one transaction per use case, JSON backup / import with validation and per-aggregate conflict handling | §57–§59, §84, §89 |
| Design | Light and dark themes designed separately (plus System), semantic tokens, Inter plus Barlow Condensed score figures, tablet two-pane scoring | §67–§74 |
| Feedback | Optional haptics and sound, reduced motion | §75–§77 |
| Accessibility | Screen-reader labels on every control and ball token, dynamic type, information never shown by colour alone, 44×44 minimum touch targets | §78 |
| Errors | Human messages ("Couldn't save this delivery. Your previous match data is still safe. [Try Again]"); diagnostics kept on a separate screen | §86, §87 |

> **Scope note on what-if and venues.** §96 lists "what-if simulation" and "multiple venues" as future extensions, but the frozen contract already includes `tournament/whatif.ts`, the `what-if.tsx` route and a venues library with `Tournament.venueIds`. They are in V1 because they cost little on top of `evaluateTournament`. They are **not release gates**: if the what-if screen slips, V1 still ships. See the inconsistency note in the orchestrator report.

### 5.2 Later (post-V1, §96). Must not complicate V1

| Feature | Readiness in the V1 architecture |
|---|---|
| Device-to-device transfer / QR sharing | Backup envelope with `exportId`, checksum and import-as-copy remapping already exist |
| Multi-scorer (two devices, one match) | The append-only log, `expectedLastSeq` and `CONFLICT` semantics already exist. It needs a sync transport. |
| Large scoreboard mode / external display / Bluetooth scoreboard | `MatchState` selectors already exist. It needs a presentation layer. |
| Player career stats / team history | Delivery columns are typed and queryable in SQL (`match_events`) |
| Full-replacement enforcement (`player_replaced` event) | Open question 8 |
| Commentary | Would be a new event kind or a separate table keyed by `seq` |
| Scheduling optimization, rest days | `scheduleSequential` is the extension point |
| Embedded logos in backups | Open question 7 |
| Organizer mode (roles on one device) | Not modelled |

## 6. Constraints

| # | Constraint | Source |
|---|---|---|
| C1 | Free and open-source only. No paid API, backend, analytics or infrastructure. | §3 |
| C2 | Fully functional with no internet, including the first launch. Fonts, sounds and icons are bundled. | §3, §6, §85 |
| C3 | Expo SDK 57, React Native 0.86, React 19.2, TypeScript, Expo Router, expo-sqlite, Zustand. Dependencies are frozen: nothing is added in V1. | CLAUDE.md |
| C4 | Strict layering: UI → stores → services → pure domain → repositories → SQLite. UI never queries SQLite and never computes cricket maths. | §60, §103 |
| C5 | The delivery (event) log is the only scoring truth. Everything else is a rebuildable projection. | §14, §59 |
| C6 | One use case = one SQLite transaction. A ball never partially modifies a match. | §89 |
| C7 | No silent destruction or alteration of historical data. Changes show WHAT WILL CHANGE first and are audited. | §55, §99 |
| C8 | No hard-coded tournament rules, NRR or qualification logic | §97, §103 |
| C9 | No code comments in source. Explanations live in docs. | CLAUDE.md |
| C10 | Single device per match (no concurrent scorers) | Architecture |

## 7. Risks

| # | Risk | Likelihood | Impact | Mitigation (in the contract) |
|---|---|---|---|---|
| R1 | Data loss when the battery dies or the app is killed mid-ball | Medium | Critical | One transaction per ball, `synchronous = FULL`, WAL, startup resume prompt, replay from the log (§23) |
| R2 | A bug in the scoring engine gives wrong scores across stored matches | Medium | High | Projections are versioned (`SCORING_PROJECTION_VERSION`) and rebuilt at startup. Engine properties are tested: determinism, totality, and incremental ≡ full replay. |
| R3 | One corrupt event makes the rest of a match unreadable | Low | High | Replay skips only the bad event; `needsRepair` blocks writes that would degrade the log further; repair by history edit |
| R4 | Laws complexity (short runs, Law 16.6, free hits, penalties across innings, super-over rules) produces disputed results | Medium | High | Laws decisions are written down as business rules (BUSINESS_RULES.md) and backed by acceptance tests per rule (CONTRACTS.md WP-scoring) |
| R5 | Organizers expect DLS and are confused by "(par score)" | High | Medium | Clear wording and a typed target. Open question 10 confirms the wording. |
| R6 | A tournament edit silently changes a played knockout | Medium | Critical | Frozen sides (`Fixture.matchSides`), slot-conflict reporting, preview == apply (`ChangePlan` plus version `CONFLICT`) |
| R7 | Too many tournament options overwhelm school and casual users | High | Medium | Templates and defaults (2/1/1/0, ICC NRR, Points → NRR → H2H → Wins → Organizer). Advanced options are behind "Customise". The wizard is resumable. |
| R8 | Poor sunlight readability or thumb reach lead to input errors | Medium | High | Outdoor UX rules (§72), contrast checked in tests, a large scoring pad, undo always one tap away, `confirm_result` before a result is final |
| R9 | Low-end Android performance on long matches or large tournaments | Medium | Medium | O(1) `applyEvent` on the live path, memoised evaluation, virtualised lists, performance budgets (REQUIREMENTS.md NFR-P) |
| R10 | Device loss destroys a season (there is no cloud) | Medium | High | One-tap JSON backup and share; a reminder after a tournament is completed (see US-B-04) |
| R11 | Duplicate or conflicting imports from several scorers corrupt a league | Medium | High | `exportId` recognition, per-aggregate conflicts, skip / copy / replace with a preview of local-only data, never merge rows |
| R12 | Integration risk across parallel work packages | Medium | Medium | Frozen contract, file ownership index, acceptance tests per work package, integration in 3 waves |
| R13 | Scope creep from §96 items | Medium | Medium | §5.2 is explicit. What-if is not a release gate. |

## 8. Success criteria (§4 phase 1)

Because the app has no analytics, success is measured by **release-gate tests** plus a **field pilot** with at least one representative of each persona (P1–P5) before public release.

### 8.1 Functional (maps to §104 Definition of Done)

| ID | Criterion |
|---|---|
| SC-F1 | The §92 scenario passes end to end on a device: 8 teams → 2 pools → single round robin → top 2 → 2 semifinals → final → champion shown in the tournaments list, with standings, NRR and qualification checked after every match |
| SC-F2 | Every configuration in the §5.1 Tournament table can be built without code changes. Each built-in template instantiates for its team count with exactly one `decidesChampion` stage. |
| SC-F3 | Every automatic qualification shows a §98 explanation. Every override shows "Manual Override" and its reason, and appears in the audit log. |
| SC-F4 | With the device in airplane mode from first install, every V1 flow works, including PDF generation, sharing to a local target and backup/import |

### 8.2 Quality and correctness

| ID | Criterion |
|---|---|
| SC-Q1 | 100% of the acceptance tests listed per work package in CONTRACTS.md pass. `npx tsc --noEmit` is clean. |
| SC-Q2 | Replay is deterministic and total: property tests over randomly generated logs never throw, and `applyEvent ∘ replayMatch = replayMatch` |
| SC-Q3 | Historical edit of a completed tournament match: the preview matches exactly what is applied (fingerprint / version `CONFLICT` otherwise), and the audit stores the removed and inserted events and the impact that was shown |
| SC-Q4 | Worked NRR examples (ICC all-out, early chase, revised target, par score, mixed balls per over) match hand calculations to 3 decimal places |

### 8.3 Reliability

| ID | Criterion |
|---|---|
| SC-R1 | Failure-injection suite (§93): killing the process between any two statements of a ball, an undo, a history edit, a tournament change or an import leaves the database either before or after the use case, never in between. `PRAGMA foreign_key_check` is empty. |
| SC-R2 | 50 consecutive pull-the-battery or force-stop trials during live scoring on a reference device lose no committed ball. The resume state equals the pre-crash state. |
| SC-R3 | Migrations: fresh install, re-run, a failing migration (rolled back) and a database newer than the app (refused) all behave as DATABASE.md §7 describes |

### 8.4 Usability and accessibility

| ID | Criterion |
|---|---|
| SC-U1 | A normal ball takes 1 tap. A bowled or caught wicket, including the fielder and the next batter, takes ≤ 3 taps after WICKET. A new over's bowler takes 1 tap when the eligible list is shown. |
| SC-U2 | In the pilot, each club scorer (P1) scores a full T20 without help and with no unrecovered errors. The school organizer (P2) sets up a 4-house tournament from a template in ≤ 10 minutes. |
| SC-A1 | Text contrast ≥ 4.5:1 (≥ 3:1 for large score figures) in both themes, checked in tests |
| SC-A2 | Every control and ball token has an accessibility label. A TalkBack / VoiceOver user can hear the score, overs, striker and last ball. |
| SC-A3 | At 200% font scale, the live score, overs and the scoring pad stay visible without horizontal scrolling |

### 8.5 Performance (full budgets in REQUIREMENTS.md NFR-P)

| ID | Criterion |
|---|---|
| SC-P1 | Tap to updated score ≤ 50 ms (p95) on the reference mid-range Android |
| SC-P2 | 128 teams / 16 pools / ~500 fixtures evaluate in < 100 ms (node) |

## 9. Release plan

| Milestone | Content | Spec sprints (§94) | Contract waves |
|---|---|---|---|
| M0 Foundation | Contract, schema, design tokens | 1 | WP-0 (done), WP-design-system |
| M1 Scoring core | Engine, database, match setup, live scoring, undo/edit, recovery | 2–5 | Wave 1 (scoring engine, db), wave 2 (services, match UI) |
| M2 Tournament core | Structure, pools, fixtures, standings, NRR, qualification, knockout | 6–9 | Wave 1 (tournament structure and standings), wave 2 (tournament UI) |
| M3 Outputs and data | PDF, analytics, backup/import, settings, diagnostics | 10–11 | WP-export |
| M4 Hardening | §93 failure tests, accessibility, performance, pilot, polish | 12 | Wave 3 |

## 10. Open questions

The product-owner questions are tracked in [CONTRACTS.md §6](../CONTRACTS.md). The ones that change user-visible behaviour are:

* Q2: in league tables, does a super-over win count as a win or as a tie? The default is ICC `win_loss`.
* Q3: abandoned vs no result in points.
* Q5 and Q10: no DLS in the app, and the "(par score)" wording.
* Q9: should formal tournament presets use `icc_one_fifth` bowler quotas by default?
