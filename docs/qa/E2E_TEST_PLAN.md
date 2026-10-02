# Scorebook — End-to-End Test Plan (§92, Maestro)

End-to-end flows drive the real app on an Android emulator or device with **Maestro**. It is free and open source (§3), and it is a standalone CLI installed on the test machine, not an npm dependency, so nothing is added to `package.json`. Flows find elements by `testID`, which React Native exposes to Maestro as `id`. This document fixes the naming convention and the **complete list of testIDs the UI packages must provide** (WP-design-system, WP-match-ui, WP-tournament-ui, WP-export). It then sketches the flows as YAML.

The main scenario, required by §92, is **E2E-06**: 8 teams → 2 pools → single round robin → top 2 qualify → 2 semifinals → final → champion.

## 1. Setup and running

| Item | Rule |
|---|---|
| App id | `pk.harris.scorebook` (from `app.json`) |
| Build | A release build on a local emulator (`npx expo run:android --variant release`). No cloud build is needed. Flows never depend on a dev menu or Metro. |
| Location | `e2e/maestro/flows/*.yaml`, `e2e/maestro/subflows/*.yaml`, `e2e/maestro/fixtures/*.json` (a backup file for the import flows) |
| Run | `maestro test e2e/maestro/flows` (all) or `maestro test e2e/maestro/flows/e2e-06-tournament.yaml` |
| Isolation | Every flow starts with `launchApp: {clearState: true}` through `subflows/launch_fresh.yaml`. Flows never depend on each other. |
| Network | Flows E2E-01 and E2E-06 run with airplane mode **on** (`setAirplaneMode: enabled`), proving §3 and §85: no feature needs a network. |
| Devices | CI matrix: Pixel 6-class emulator (API 35, 1080×2400) in portrait, plus a 10-inch tablet emulator for E2E-13 (the two-pane layout, §74) |
| YAML | No `#` comments in flow files (CLAUDE.md "no comments anywhere"). Each flow's `name:` carries its ID. |

## 2. testID naming convention

1. **Format:** lowercase kebab-case ASCII, matching `^[a-z0-9]+(-[a-z0-9]+)*$`. No dots, because Maestro `id` matching is a regex and a dot would need escaping.
2. **Shape:** `<scope>-<kind>-<name>[-<qualifier>…]`.
   * `scope` is the screen or component key: `home`, `setup`, `score`, `extras`, `wicket`, `scorecard`, `twiz` (tournament wizard), `dash`, `standings`, and so on.
   * `kind` is one of:
     * `btn`: a pressable action;
     * `input`: a text field;
     * `toggle`: a switch or checkbox;
     * `chip`: a single-choice option;
     * `tab`: a tab;
     * `row`: a list item or pressable row;
     * `text`: a read-only value the flows assert;
     * `cell`: a table cell;
     * `banner`: an inline notice;
     * `badge`: a status marker;
     * `icon`: a meaningful icon;
     * `group`: a container used with `childOf`.
3. **Screen roots:** every route renders its root view with `screen-<route-key>` (for example `screen-home`, `screen-score`, `screen-standings`). Sheets and dialogs use `sheet-<name>` / `dialog-<name>`.
4. **Dynamic items** carry a key the test can know without reading the database:
   * The 1-based display position: `history-row-3`.
   * The fixture `matchNumber`: `fixtures-row-12`.
   * The pool letter plus position: `standings-row-a-1`.
   * The bracket round and position: `bracket-row-1-0` (round 1, position 0, the `BracketPosition` fields).
   * The event seq: `balls-row-17`.
   * **Never** a UUID, and never a team or player name. Names contain spaces and are user data; flows tap names with `text:` because the flow itself typed them.
5. `testID` goes on the pressable or the value element itself, not on a wrapping `View`. `accessibilityLabel` is always set **as well** and is human text, never equal to the testID (§78).
6. `text` elements render exactly the formatted domain string (`formatScore`, `formatOvers`, `formatNrr`, `formatResult`, the qualification `explanation`). Flows assert those strings verbatim, so no screen may reformat them.
7. testIDs are stable API. Renaming one is a breaking change that must update this list and the flows in the same change.

## 3. Required testIDs

`<n>` = 1-based position; `<L>` = pool letter (a, b, …); `<mn>` = match number; `<r>`/`<p>` = bracket round/position; `<seq>` = event seq.

### 3.1 Global

| testID | Element |
|---|---|
| `tab-home`, `tab-tournaments`, `tab-history`, `tab-settings` | Tab bar items (§5) |
| `nav-btn-back` | Header back |
| `toast`, `toast-text`, `toast-btn-action` | Toast host; the action is "Try Again" (§86) |
| `sheet-impact`, `impact-text-headline`, `impact-row-<n>`, `impact-input-reason`, `impact-btn-cancel`, `impact-btn-continue` | WHAT WILL CHANGE sheet (§34, §99) |
| `dialog-confirm`, `dialog-text-message`, `dialog-input-typed-name`, `dialog-btn-confirm`, `dialog-btn-cancel` | Confirmation dialog |
| `error-screen`, `error-text-message`, `error-btn-retry` | Recoverable startup error (§86) |
| `picker-input-search`, `picker-row-<n>` | Generic list picker (teams, players, venues) |

### 3.2 Home, resume prompt, teams (WP-match-ui)

| testID | Element |
|---|---|
| `screen-home`, `home-btn-new-match`, `home-btn-tournaments`, `home-btn-teams` | Home (§79) and the entry to the team library |
| `home-row-continue-<n>`, `home-text-continue-score-<n>`, `home-row-recent-<n>`, `home-text-empty` | Continue Match list, recent list, empty state |
| `resume-prompt`, `resume-text-team`, `resume-text-score`, `resume-text-overs`, `resume-btn-resume`, `resume-btn-save-exit`, `resume-btn-discard` | §23 "MATCH IN PROGRESS" prompt |
| `screen-teams`, `teams-btn-add`, `teams-row-<n>` | Team library |
| `team-input-name`, `team-input-short-name`, `team-btn-add-player`, `team-input-player-name-<n>`, `team-btn-save` | Team editor |

### 3.3 Match setup (§64)

| testID | Element |
|---|---|
| `screen-match-new`, `setup-input-title`, `setup-chip-format-<t5\|t10\|t20\|t30\|t40\|t50\|custom>`, `setup-chip-overs-<1\|2\|5\|6\|10\|20\|25\|30\|40\|50>`, `setup-input-overs-custom`, `setup-input-players-per-side`, `setup-btn-rules`, `setup-btn-next` | Match information, format and rules |
| `setup-btn-team-a`, `setup-btn-team-b` | Team selection (opens the picker) |
| `setup-row-player-a-<n>`, `setup-row-player-b-<n>`, `setup-toggle-sub-a-<n>`, `setup-toggle-sub-b-<n>`, `setup-btn-add-player-a`, `setup-btn-add-player-b` | Squads and substitute fielders |
| `toss-group-winner`, `toss-btn-bat`, `toss-btn-bowl`, `toss-btn-skip` | Toss (team buttons inside `toss-group-winner`, tapped by team name) |
| `openers-btn-striker`, `openers-btn-non-striker`, `openers-btn-bowler`, `openers-btn-start` | Openers; also reused by the `start_next_innings` prompt |

### 3.4 Live scoring (§9–§21)

| testID | Element |
|---|---|
| `screen-score` | Root |
| `score-text-batting-team`, `score-text-total`, `score-text-overs`, `score-text-crr`, `score-text-rrr`, `score-text-target`, `score-text-required`, `score-text-balls-left` | Header (§10), e.g. total `142/4`, overs `16.4`, required `Need 76 from 50 balls` |
| `score-row-striker`, `score-icon-striker`, `score-row-non-striker`, `score-row-bowler` | Batter and bowler lines (§11, §12); the striker marker is an icon with a label, not colour only |
| `score-row-over`, `score-chip-ball-<n>` | Current over strip (§13); a chip's text is the `BallToken.text` |
| `score-btn-0`, `score-btn-1`, `score-btn-2`, `score-btn-3`, `score-btn-4`, `score-btn-6`, `score-btn-extras`, `score-btn-wicket` | The pad (§9) |
| `score-btn-undo`, `score-btn-redo`, `score-btn-swap-strike`, `score-btn-more` | Secondary actions |
| `score-banner-free-hit`, `score-banner-retirement`, `score-btn-retire-now`, `score-banner-repair` | Free hit, mandatory retirement advisory, "This match needs repair" |
| `sheet-extras`, `extras-tab-wide`, `extras-tab-no-ball`, `extras-tab-bye`, `extras-tab-leg-bye` | Extras sheet (§17) |
| `extras-btn-wide-<0..4>`, `extras-btn-wide-boundary` | WD, WD+1 … WD+4 (ran n), five wides (boundary) |
| `extras-btn-nb-bat-<0\|1\|2\|3\|4\|6>`, `extras-btn-nb-bye-<1..4>`, `extras-btn-nb-leg-bye-<1..4>` | No-ball variants |
| `extras-btn-bye-<1..4>`, `extras-btn-leg-bye-<1..4>` | Byes and leg-byes |
| `extras-input-custom`, `extras-toggle-short-run`, `extras-btn-custom-confirm` | Custom value and short run |
| `sheet-wicket`, `wicket-btn-type-<bowled\|caught\|lbw\|run-out\|stumped\|hit-wicket\|hit-ball-twice\|obstructing-field\|handled-ball\|timed-out\|retired-hurt\|retired-not-out\|retired-out>` | Wicket type (the options come from `allowedDismissals`) |
| `wicket-btn-out-striker`, `wicket-btn-out-non-striker`, `wicket-btn-end-striker`, `wicket-btn-end-non-striker`, `wicket-btn-runs-<0..3>`, `wicket-chip-call-<fair\|wide\|no-ball>` | Run-out details and call |
| `wicket-row-fielder-<n>`, `wicket-btn-fielder-unknown`, `wicket-row-next-batter-<n>`, `wicket-btn-confirm` | Fielder and incoming batter (≤ 3 taps for bowled/caught) |
| `prompt-next-batter`, `batter-row-<n>`, `batter-btn-add-player`, `batter-btn-end-innings` | `select_next_batter` |
| `prompt-next-bowler`, `bowler-row-<n>`, `bowler-row-ineligible-<n>`, `bowler-text-reason-<n>` | `select_next_bowler` (ineligible rows show the reason) |
| `prompt-start-innings` | `start_next_innings` (uses the `openers-*` ids) |
| `prompt-confirm-result`, `result-text`, `result-btn-confirm`, `result-btn-undo` | `confirm_result` |
| `prompt-resolve-tie`, `tie-btn-super-over`, `tie-btn-accept`, `tie-btn-decide-other` | `resolve_tie` |
| `prompt-resume-play`, `resume-play-btn` | `resume_play` |
| `screen-match-manage`, `manage-btn-suspend`, `manage-chip-reason-<rain\|bad-light\|…>`, `manage-btn-revise-overs`, `manage-input-overs`, `manage-input-balls`, `manage-input-target`, `manage-toggle-both-innings`, `manage-toggle-terminal`, `manage-btn-penalty`, `manage-btn-declare`, `manage-btn-end-match`, `manage-chip-outcome-<no-result\|abandoned\|walkover\|awarded>`, `manage-input-reason`, `manage-btn-apply` | Manage match (§7 revisions, §22 outcomes) |

### 3.5 Scorecard, ball log, edit, history

| testID | Element |
|---|---|
| `screen-scorecard`, `scorecard-text-result`, `scorecard-tab-innings-<n>`, `scorecard-row-batter-<n>`, `scorecard-text-dismissal-<n>`, `scorecard-row-bowler-<n>`, `scorecard-text-extras`, `scorecard-row-fow-<n>`, `scorecard-row-partnership-<n>`, `scorecard-btn-balls`, `scorecard-btn-analytics`, `scorecard-btn-export-pdf`, `scorecard-btn-share` | Scorecard (§83 content) |
| `screen-balls`, `balls-row-<seq>` | Ball-by-ball log |
| `screen-edit-ball`, `edit-btn-outcome-<0\|1\|2\|3\|4\|6\|wide\|no-ball\|wicket>`, `edit-text-impact-headline`, `edit-row-impact-<n>`, `edit-input-reason`, `edit-btn-apply`, `edit-btn-cancel` | Historical edit with WHAT WILL CHANGE (§16) |
| `screen-history`, `history-input-search`, `history-btn-filter`, `history-chip-status-<status>`, `history-btn-sort`, `history-row-<n>`, `history-text-result-<n>`, `history-btn-delete-<n>` | History (§81) |

### 3.6 Tournament (WP-tournament-ui)

| testID | Element |
|---|---|
| `screen-tournaments`, `tournaments-btn-create`, `tournaments-row-<n>`, `tournaments-text-status-<n>`, `tournaments-text-champion-<n>`, `tournaments-text-empty` | List (§82) and empty state (§87) |
| `screen-tournament-new`, `twiz-btn-next`, `twiz-btn-back`, `twiz-text-step` | Wizard shell (§25) |
| `twiz-input-name`, `twiz-input-season`, `twiz-input-organizer`, `twiz-input-start-date`, `twiz-input-end-date` | Information (§26) |
| `twiz-btn-add-team`, `twiz-row-team-<n>`, `twiz-input-seed-<n>`, `twiz-text-team-count` | Teams (§27) |
| `twiz-chip-template-<8-team-t20\|4-team-league\|8-team-knockout\|16-team-groups\|20-team-pools>`, `twiz-chip-structure-<league\|groups\|knockout\|groups-knockout\|custom>` | Structure (§28, §56) |
| `twiz-input-points-win`, `twiz-input-points-tie`, `twiz-input-points-nr`, `twiz-input-points-loss`, `twiz-chip-nrr-<icc\|actual-overs>`, `twiz-row-tiebreaker-<n>`, `twiz-text-tiebreak-chain`, `twiz-chip-overs-<n>`, `twiz-input-overs-custom`, `twiz-input-players-per-side` | Rules (§40–§43) and default match rules |
| `twiz-btn-pools-random`, `twiz-input-pool-seed`, `twiz-text-pool-seed`, `twiz-text-replace-warning`, `twiz-btn-pools-manual`, `pools-row-unassigned-<n>`, `pools-btn-target-<L>`, `twiz-row-pool-<L>-<n>`, `twiz-text-uneven-warning` | Pools (§30–§32) |
| `twiz-btn-generate`, `twiz-text-fixture-count`, `twiz-row-fixture-<mn>`, `twiz-btn-edit-fixture-<mn>`, `twiz-text-fixture-issue-<n>`, `twiz-btn-confirm-fixtures`, `twiz-btn-confirm-tournament` | Fixtures preview → confirm (§35, §36) and review |
| `screen-tournament`, `dash-text-name`, `dash-text-stage`, `dash-text-progress`, `dash-row-next-match`, `dash-btn-start-next`, `dash-text-champion`, `dash-btn-standings`, `dash-btn-fixtures`, `dash-btn-pools`, `dash-btn-bracket`, `dash-btn-qualification`, `dash-btn-what-if`, `dash-btn-stats`, `dash-btn-audit`, `dash-btn-teams`, `dash-btn-manage` | Dashboard (§49, §80) |
| `screen-standings`, `standings-tab-pool-<L>`, `standings-tab-overall`, `standings-row-<L>-<pos>`, `standings-cell-<L>-<pos>-<pos\|team\|p\|w\|l\|nr\|pts\|nrr>`, `standings-text-qual-<L>-<pos>`, `standings-text-tiebreak-<L>-<pos>`, `standings-text-chain` | Standings (§50, §51, §98) |
| `screen-fixtures`, `fixtures-row-<mn>`, `fixtures-text-teams-<mn>`, `fixtures-text-status-<mn>`, `fixtures-btn-add` | Fixtures list and "+ Add Match" (§37) |
| `screen-fixture`, `fixture-text-teams`, `fixture-text-status`, `fixture-btn-start-match`, `fixture-btn-open-match`, `fixture-btn-postpone`, `fixture-btn-reschedule`, `fixture-btn-cancel`, `fixture-btn-edit` | Fixture detail (§38, §39, §66) |
| `screen-pools`, `pools-row-<L>-<n>`, `pools-btn-move`, `pools-btn-swap`, `pools-btn-replace` | Pools editor (§33) |
| `screen-qualification`, `qual-row-<n>`, `qual-text-explanation-<n>`, `qual-badge-manual-<n>`, `qual-btn-override-<n>`, `override-chip-<qualify\|eliminate\|reassign>`, `override-input-reason`, `override-btn-apply` | Qualification and overrides (§47, §51) |
| `screen-bracket`, `bracket-row-<r>-<p>`, `bracket-text-sides-<r>-<p>`, `bracket-text-winner-<r>-<p>`, `bracket-text-champion` | Bracket (§46) |
| `screen-what-if`, `whatif-row-<mn>`, `whatif-chip-<mn>-<side-a\|side-b\|tie\|no-result>`, `whatif-btn-run`, `whatif-text-narrative-<n>`, `whatif-btn-reset` | What-if (§48) |
| `screen-tournament-stats`, `stats-text-total-matches`, `stats-row-record-<highest-team-score\|highest-individual-score\|best-bowling\|most-sixes\|most-fours\|highest-partnership>` | Stats (§52) |
| `screen-audit`, `audit-row-<n>`, `audit-text-summary-<n>`, `audit-text-reason-<n>` | Audit (§53) |
| `screen-tournament-manage`, `tmanage-btn-complete`, `tmanage-btn-archive`, `tmanage-btn-export-pdf`, `tmanage-btn-backup`, `tmanage-btn-save-template`, `tmanage-btn-delete` | Manage |

### 3.7 Settings, backup, diagnostics (WP-export)

| testID | Element |
|---|---|
| `screen-settings`, `settings-chip-theme-<light\|dark\|system>`, `settings-toggle-haptics`, `settings-toggle-sound`, `settings-chip-motion-<system\|on\|off>`, `settings-chip-dot-<zero\|dot>`, `settings-btn-backup`, `settings-btn-presets`, `settings-btn-diagnostics` | Settings (§70, §76–§78) |
| `screen-backup`, `backup-btn-export-full`, `backup-btn-import`, `import-text-summary`, `import-row-issue-<n>`, `import-row-conflict-<n>`, `import-text-previously-imported`, `import-chip-policy-<skip\|copy\|replace>`, `import-btn-apply`, `import-text-report` | Backup and import (§84) |
| `screen-diagnostics`, `diag-btn-fk-check`, `diag-text-fk-result`, `diag-row-repair-<n>`, `diag-text-schema-version`, `diag-text-pragmas` | Diagnostics (§86, §93); `diag-text-pragmas` shows e.g. `foreign_keys=1 journal_mode=wal synchronous=2` (FAILURE_RECOVERY FR-02b) |

## 4. Shared subflows

`subflows/launch_fresh.yaml`

```yaml
appId: pk.harris.scorebook
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible:
      id: "screen-home"
    timeout: 15000
```

`subflows/create_team.yaml` (env: `TEAM`, `SHORT`; creates three players named `${SHORT} 1..3`)

```yaml
appId: pk.harris.scorebook
---
- tapOn:
    id: "tab-home"
- tapOn:
    id: "home-btn-teams"
- tapOn:
    id: "teams-btn-add"
- tapOn:
    id: "team-input-name"
- inputText: "${TEAM}"
- tapOn:
    id: "team-input-short-name"
- inputText: "${SHORT}"
- repeat:
    times: 3
    commands:
      - tapOn:
          id: "team-btn-add-player"
- tapOn:
    id: "team-input-player-name-1"
- inputText: "${SHORT} 1"
- tapOn:
    id: "team-input-player-name-2"
- inputText: "${SHORT} 2"
- tapOn:
    id: "team-input-player-name-3"
- inputText: "${SHORT} 3"
- tapOn:
    id: "team-btn-save"
- assertVisible:
    text: "${TEAM}"
```

`subflows/play_1over_match.yaml`

This plays one 1-over, 3-a-side tournament match in which `WIN` bats first and scores 6, and `LOSE` scores 0.
- env: `PAIR` (a regex matching the fixture label in either order), `WIN`, `WS` (the short name of `WIN`), `LOSE`, `LS`.

```yaml
appId: pk.harris.scorebook
---
- tapOn:
    id: "dash-btn-fixtures"
- scrollUntilVisible:
    element:
      text: "${PAIR}"
- tapOn:
    text: "${PAIR}"
- tapOn:
    id: "fixture-btn-start-match"
- tapOn:
    id: "setup-btn-next"
- tapOn:
    text: "${WIN}"
    childOf:
      id: "toss-group-winner"
- tapOn:
    id: "toss-btn-bat"
- tapOn:
    id: "openers-btn-striker"
- tapOn:
    text: "${WS} 1"
- tapOn:
    id: "openers-btn-non-striker"
- tapOn:
    text: "${WS} 2"
- tapOn:
    id: "openers-btn-bowler"
- tapOn:
    text: "${LS} 3"
- tapOn:
    id: "openers-btn-start"
- repeat:
    times: 6
    commands:
      - tapOn:
          id: "score-btn-1"
- assertVisible:
    id: "prompt-start-innings"
- tapOn:
    id: "openers-btn-striker"
- tapOn:
    text: "${LS} 1"
- tapOn:
    id: "openers-btn-non-striker"
- tapOn:
    text: "${LS} 2"
- tapOn:
    id: "openers-btn-bowler"
- tapOn:
    text: "${WS} 3"
- tapOn:
    id: "openers-btn-start"
- assertVisible:
    id: "score-text-required"
    text: "Need 7 from 6 balls"
- repeat:
    times: 6
    commands:
      - tapOn:
          id: "score-btn-0"
- assertVisible:
    id: "result-text"
    text: "${WIN} won by 6 runs"
- tapOn:
    id: "result-btn-confirm"
- tapOn:
    id: "nav-btn-back"
```

`subflows/assert_standing.yaml` (env: `L`, `POS`, `TEAM`, `PTS`, `NRR`)

```yaml
appId: pk.harris.scorebook
---
- assertVisible:
    id: "standings-cell-${L}-${POS}-team"
    text: "${TEAM}"
- assertVisible:
    id: "standings-cell-${L}-${POS}-pts"
    text: "${PTS}"
- assertVisible:
    id: "standings-cell-${L}-${POS}-nrr"
    text: "${NRR}"
```

## 5. E2E-06 — the §92 tournament (main flow)

Scenario:
- 8 teams: Pool A Lions, Tigers, Eagles, Hawks; Pool B Bulls, Bears, Cobras, Wolves.
- Template `8-team-t20` with the rules changed to 1 over and 3 players per side.
- Manual pools.
- Group results, each "winner bats first, 6/0 v 0/0": Lions beat everyone in A, Tigers beat Eagles and Hawks, Eagles beat Hawks. In B: Bulls, then Bears, then Cobras, then Wolves, in the same pattern.
- Expected tables:
  - A: Lions 6 (+6.000), Tigers 4 (+2.000), Eagles 2 (−2.000), Hawks 0 (−6.000).
  - B: Bulls 6, Bears 4, Cobras 2, Wolves 0 (the same NRRs).
- Semifinals: SF1 = A1 v B2 = Lions v Bears; SF2 = B1 v A2 = Bulls v Tigers.
- Final: Lions beat Bulls. Champion **Lions**.

`flows/e2e-06-tournament.yaml`

```yaml
appId: pk.harris.scorebook
name: E2E-06 Complete 8-team tournament (§92)
---
- runFlow: ../subflows/launch_fresh.yaml
- setAirplaneMode: enabled
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Lions",  SHORT: "LIO" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Tigers", SHORT: "TIG" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Eagles", SHORT: "EAG" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Hawks",  SHORT: "HAW" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Bulls",  SHORT: "BUL" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Bears",  SHORT: "BEA" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Cobras", SHORT: "COB" } }
- runFlow: { file: ../subflows/create_team.yaml, env: { TEAM: "Wolves", SHORT: "WOL" } }
- tapOn: { id: "tab-tournaments" }
- assertVisible: { id: "tournaments-text-empty" }
- tapOn: { id: "tournaments-btn-create" }
- tapOn: { id: "twiz-input-name" }
- inputText: "Scorebook Cup E2E"
- tapOn: { id: "twiz-btn-next" }
- repeat:
    times: 8
    commands:
      - tapOn: { id: "twiz-btn-add-team" }
      - tapOn: { id: "picker-row-1" }
- assertVisible: { id: "twiz-text-team-count", text: "8 teams" }
- tapOn: { id: "twiz-btn-next" }
- tapOn: { id: "twiz-chip-template-8-team-t20" }
- tapOn: { id: "twiz-btn-next" }
- assertVisible: { id: "twiz-text-tiebreak-chain", text: "Points → NRR → Head-to-Head → Most wins → Organizer decision" }
- tapOn: { id: "twiz-chip-overs-1" }
- tapOn: { id: "twiz-input-players-per-side" }
- eraseText
- inputText: "3"
- tapOn: { id: "twiz-btn-next" }
- tapOn: { id: "twiz-btn-pools-manual" }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Lions",  L: "a" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Tigers", L: "a" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Eagles", L: "a" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Hawks",  L: "a" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Bulls",  L: "b" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Bears",  L: "b" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Cobras", L: "b" } }
- runFlow: { file: ../subflows/assign_member.yaml, env: { NAME: "Wolves", L: "b" } }
- assertNotVisible: { id: "twiz-text-uneven-warning" }
- tapOn: { id: "twiz-btn-next" }
- tapOn: { id: "twiz-btn-generate" }
- assertVisible: { id: "twiz-text-fixture-count", text: "12 matches" }
- tapOn: { id: "twiz-btn-confirm-fixtures" }
- tapOn: { id: "twiz-btn-next" }
- tapOn: { id: "twiz-btn-confirm-tournament" }
- assertVisible: { id: "dash-text-progress", text: "0/15" }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Lions v Tigers|Tigers v Lions).*", WIN: "Lions",  WS: "LIO", LOSE: "Tigers", LS: "TIG" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Lions v Eagles|Eagles v Lions).*", WIN: "Lions",  WS: "LIO", LOSE: "Eagles", LS: "EAG" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Lions v Hawks|Hawks v Lions).*",   WIN: "Lions",  WS: "LIO", LOSE: "Hawks",  LS: "HAW" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Tigers v Eagles|Eagles v Tigers).*", WIN: "Tigers", WS: "TIG", LOSE: "Eagles", LS: "EAG" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Tigers v Hawks|Hawks v Tigers).*",   WIN: "Tigers", WS: "TIG", LOSE: "Hawks",  LS: "HAW" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Eagles v Hawks|Hawks v Eagles).*",   WIN: "Eagles", WS: "EAG", LOSE: "Hawks",  LS: "HAW" } }
- tapOn: { id: "dash-btn-standings" }
- tapOn: { id: "standings-tab-pool-a" }
- runFlow: { file: ../subflows/assert_standing.yaml, env: { L: "a", POS: "1", TEAM: "Lions",  PTS: "6", NRR: "+6.000" } }
- runFlow: { file: ../subflows/assert_standing.yaml, env: { L: "a", POS: "2", TEAM: "Tigers", PTS: "4", NRR: "+2.000" } }
- runFlow: { file: ../subflows/assert_standing.yaml, env: { L: "a", POS: "3", TEAM: "Eagles", PTS: "2", NRR: "-2.000" } }
- runFlow: { file: ../subflows/assert_standing.yaml, env: { L: "a", POS: "4", TEAM: "Hawks",  PTS: "0", NRR: "-6.000" } }
- assertVisible: { id: "standings-text-qual-a-1", text: "Lions have mathematically qualified for the Knockouts.*" }
- assertVisible: { id: "standings-text-qual-a-3", text: ".*Eagles.*(eliminated|out of).*" }
- tapOn: { id: "nav-btn-back" }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Bulls v Bears|Bears v Bulls).*",     WIN: "Bulls",  WS: "BUL", LOSE: "Bears",  LS: "BEA" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Bulls v Cobras|Cobras v Bulls).*",   WIN: "Bulls",  WS: "BUL", LOSE: "Cobras", LS: "COB" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Bulls v Wolves|Wolves v Bulls).*",   WIN: "Bulls",  WS: "BUL", LOSE: "Wolves", LS: "WOL" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Bears v Cobras|Cobras v Bears).*",   WIN: "Bears",  WS: "BEA", LOSE: "Cobras", LS: "COB" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Bears v Wolves|Wolves v Bears).*",   WIN: "Bears",  WS: "BEA", LOSE: "Wolves", LS: "WOL" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*(Cobras v Wolves|Wolves v Cobras).*", WIN: "Cobras", WS: "COB", LOSE: "Wolves", LS: "WOL" } }
- assertVisible: { id: "dash-text-progress", text: "12/15" }
- assertVisible: { id: "dash-text-stage", text: "Knockouts" }
- tapOn: { id: "dash-btn-bracket" }
- assertVisible: { id: "bracket-text-sides-1-0", text: "Lions v Bears" }
- assertVisible: { id: "bracket-text-sides-1-1", text: "Bulls v Tigers" }
- assertVisible: { id: "bracket-text-sides-2-0", text: "Winner SF1 v Winner SF2" }
- tapOn: { id: "nav-btn-back" }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*Lions v Bears.*",  WIN: "Lions", WS: "LIO", LOSE: "Bears",  LS: "BEA" } }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*Bulls v Tigers.*", WIN: "Bulls", WS: "BUL", LOSE: "Tigers", LS: "TIG" } }
- tapOn: { id: "dash-btn-bracket" }
- assertVisible: { id: "bracket-text-sides-2-0", text: "Lions v Bulls" }
- tapOn: { id: "nav-btn-back" }
- runFlow: { file: ../subflows/play_1over_match.yaml, env: { PAIR: ".*Lions v Bulls.*", WIN: "Lions", WS: "LIO", LOSE: "Bulls", LS: "BUL" } }
- assertVisible: { id: "dash-text-champion", text: "Lions" }
- assertVisible: { id: "dash-text-progress", text: "15/15" }
- tapOn: { id: "dash-btn-manage" }
- tapOn: { id: "tmanage-btn-complete" }
- tapOn: { id: "dialog-btn-confirm" }
- tapOn: { id: "tab-tournaments" }
- assertVisible: { id: "tournaments-text-champion-1", text: "Lions" }
- assertVisible: { id: "tournaments-text-status-1", text: "Completed" }
- setAirplaneMode: disabled
```

`subflows/assign_member.yaml` (env `NAME`, `L`): tap `text: NAME` inside `pools-row-unassigned-*`, then `pools-btn-target-${L}`.

Checks built into E2E-06:
- a fixture label order independent of generation (regex `PAIR`);
- the §98 explanations;
- that the knockout sides come from the slots;
- the champion on both the dashboard and the tournaments list;
- that no network is used.

The flow must pass 3 times in a row with no retries (flakiness gate).

## 6. Other flows

Each flow is listed with its purpose and key steps. The first four have YAML sketches in §7.

| ID | Flow | Covers | Key steps and assertions |
|---|---|---|---|
| E2E-01 | `e2e-01-standalone-match.yaml` | §64, §9–§13, §83 | Scores the golden match G1 of UNIT_TEST_PLAN through the UI (M3 rules: 3 overs, 11-a-side; two teams created by `create_team_11.yaml`). Asserts the header after each over: `15/0`, `1.0` overs (live header uses `alwaysShowBalls`), CRR `15.00`; `21/1`, `2.0`, CRR `10.50`; innings break `27/1`. The chase header shows `Need 10 from 12 balls` and RRR `5.00`. The result is "Tigers won by 9 wickets (4 balls left)". The scorecard shows `b Shaheen` and `c Amir b Abdul`. Export PDF leads to the share sheet (OS dialog, dismissed with `back`); the toast is absent. |
| E2E-02 | `e2e-02-crash-resume.yaml` | §23, §93 | Mid-over 2: `stopApp` → `launchApp` (no clear) → `resume-prompt` shows `Lions`, `15/1`, `1.2` → RESUME → identical header and current-over chips. SAVE & EXIT → relaunch → no prompt, but `home-row-continue-1` is present. DISCARD → confirm → the match is gone from history. |
| E2E-03 | `e2e-03-undo-redo.yaml` | §15 | A wicket plus next batter in one sheet → undo → the wicket and the batter are both gone (`score-text-total` back to its previous value) → redo → restored. Undo across an over end restores the previous bowler. After any new ball, redo is disabled. |
| E2E-04 | `e2e-04-extras-wickets.yaml` | §17, §18 | Every extras button once; the `score-chip-ball-<n>` texts are `WD`, `WD+1`, `WD+4`, `NB`, `NB+4`, `NB+6`, `NB+2B`, `NB+1LB`, `B1`, `LB2`; free-hit banner after `NB`; caught is not offered on a free hit (`wicket-btn-type-caught` not visible); stumped off a wide gives `WD+W`; a run out at the non-striker's end with 1 run leaves the correct striker. |
| E2E-05 | `e2e-05-history-edit.yaml` | §16, §99 | Completed G1 → ball log → `balls-row-<seq>` of the chase's last ball (`1`) → `edit-btn-outcome-2` → the preview shows the chase total `29/1` and the unchanged result → apply is disabled until a reason is typed → apply → scorecard `29/1`, result still "Tigers won by 9 wickets (4 balls left)". (Edits that move the target, such as FOUR → wide in innings 1, make the recorded chase invalid and must show the validation message instead: a second case, asserting that `edit-btn-apply` stays disabled.) |
| E2E-07 | `e2e-07-pools-random.yaml` | §31, §32 | 10 teams, 3 pools → random with seed `847291` → `twiz-text-pool-seed` shows `847291` → regenerate with the same seed → the same members (read row texts twice with `copyTextFrom` and compare) → "Current pool arrangement will be replaced." shown before replacing → `twiz-text-uneven-warning` = "Teams in different pools may play different numbers of matches." |
| E2E-08 | `e2e-08-pool-move-impact.yaml` | §33, §34 | After fixtures are confirmed and one match is played: Pools → move Hawks to Pool B → `sheet-impact` lists the removed and created fixtures → Cancel leaves the standings unchanged → repeat → Continue with a reason → an audit row "Moved Hawks from Pool A to Pool B" |
| E2E-09 | `e2e-09-correction-after-sf.yaml` | §93, §55 | The E2E-06 state after the semifinals: in Tigers v Eagles, edit Eagles' balls 5 and 6 from `0` to `1` and `6`, so Eagles reach 7 on the last ball → the impact sheet names the A2 slot change and "already played" SF2 → confirm with a reason → the standings show Eagles 2nd (4 pts), and the bracket still shows `Bulls v Tigers` for SF2 and the champion is unchanged. |
| E2E-10 | `e2e-10-override.yaml` | §47 | Qualification → override "qualify Eagles into A2" → a reason is required → the `qual-badge-manual-<n>` "Manual Override" badge is visible → the audit row shows the reason → revoke restores Tigers. |
| E2E-11 | `e2e-11-what-if.yaml` | §48 | Mid-group: set a hypothetical win → run → the narrative is shown → back to the dashboard → the progress and standings are unchanged. |
| E2E-12 | `e2e-12-backup-duplicate.yaml` | §84, §93 | Export full → import the same file → `import-text-previously-imported` is visible → policy skip → report "nothing imported" → import as copy → the tournaments list shows 2 tournaments with the same name → both evaluate. |
| E2E-13 | `e2e-13-themes-tablet.yaml` | §68–§70, §74 | Switch light/dark/system on Home, scoring, standings and scorecard; `takeScreenshot` for each (reviewed manually against AC-E12). On the tablet emulator the scoring screen shows the scorecard pane alongside. |
| E2E-14 | `e2e-14-empty-and-errors.yaml` | §86, §87 | A fresh install shows `tournaments-text-empty` and the Home empty state. An invalid backup file (from `fixtures/`) shows `import-row-issue-1` with a human message and no stack text. |

## 7. Flow sketches

`flows/e2e-02-crash-resume.yaml`

```yaml
appId: pk.harris.scorebook
name: E2E-02 Crash and resume
---
- runFlow: ../subflows/launch_fresh.yaml
- runFlow: ../subflows/setup_standalone_m3.yaml
- runFlow: ../subflows/score_g1_over1.yaml
- runFlow: ../subflows/select_bowler.yaml
- tapOn: { id: "score-btn-0" }
- tapOn: { id: "score-btn-wicket" }
- tapOn: { id: "wicket-btn-type-bowled" }
- tapOn: { id: "wicket-row-next-batter-1" }
- tapOn: { id: "wicket-btn-confirm" }
- assertVisible: { id: "score-text-total", text: "15/1" }
- stopApp
- launchApp
- assertVisible: { id: "resume-prompt" }
- assertVisible: { id: "resume-text-team", text: "Lions" }
- assertVisible: { id: "resume-text-score", text: "15/1" }
- assertVisible: { id: "resume-text-overs", text: "1.2" }
- tapOn: { id: "resume-btn-resume" }
- assertVisible: { id: "score-text-total", text: "15/1" }
- assertVisible: { id: "score-chip-ball-2", text: "W" }
- stopApp
- launchApp
- tapOn: { id: "resume-btn-save-exit" }
- stopApp
- launchApp
- assertNotVisible: { id: "resume-prompt" }
- assertVisible: { id: "home-row-continue-1" }
- tapOn: { id: "home-row-continue-1" }
- tapOn: { id: "score-btn-1" }
- stopApp
- launchApp
- assertVisible: { id: "resume-prompt" }
- tapOn: { id: "resume-btn-discard" }
- tapOn: { id: "dialog-btn-confirm" }
- assertNotVisible: { id: "home-row-continue-1" }
```

`flows/e2e-03-undo-redo.yaml` (excerpt)

```yaml
appId: pk.harris.scorebook
name: E2E-03 Undo and redo
---
- runFlow: ../subflows/launch_fresh.yaml
- runFlow: ../subflows/setup_standalone_m3.yaml
- tapOn: { id: "score-btn-4" }
- tapOn: { id: "score-btn-wicket" }
- tapOn: { id: "wicket-btn-type-caught" }
- tapOn: { id: "wicket-row-fielder-1" }
- tapOn: { id: "wicket-row-next-batter-1" }
- tapOn: { id: "wicket-btn-confirm" }
- assertVisible: { id: "score-text-total", text: "4/1" }
- tapOn: { id: "score-btn-undo" }
- assertVisible: { id: "score-text-total", text: "4/0" }
- assertNotVisible: { id: "prompt-next-batter" }
- tapOn: { id: "score-btn-redo" }
- assertVisible: { id: "score-text-total", text: "4/1" }
- tapOn: { id: "score-btn-undo" }
- tapOn: { id: "score-btn-1" }
- assertVisible: { id: "score-btn-redo", enabled: false }
```

`flows/e2e-04-extras-wickets.yaml` (excerpt)

```yaml
appId: pk.harris.scorebook
name: E2E-04 Extras and wicket combinations
---
- runFlow: ../subflows/launch_fresh.yaml
- runFlow: ../subflows/setup_standalone_m3.yaml
- tapOn: { id: "score-btn-extras" }
- tapOn: { id: "extras-btn-wide-1" }
- assertVisible: { id: "score-chip-ball-1", text: "WD\\+1" }
- tapOn: { id: "score-btn-extras" }
- tapOn: { id: "extras-tab-no-ball" }
- tapOn: { id: "extras-btn-nb-bye-2" }
- assertVisible: { id: "score-chip-ball-2", text: "NB\\+2B" }
- assertVisible: { id: "score-banner-free-hit" }
- tapOn: { id: "score-btn-wicket" }
- assertNotVisible: { id: "wicket-btn-type-caught" }
- assertVisible: { id: "wicket-btn-type-run-out" }
- tapOn: { id: "nav-btn-back" }
- tapOn: { id: "score-btn-0" }
- assertNotVisible: { id: "score-banner-free-hit" }
- tapOn: { id: "score-btn-wicket" }
- tapOn: { id: "wicket-chip-call-wide" }
- tapOn: { id: "wicket-btn-type-stumped" }
- tapOn: { id: "wicket-row-next-batter-1" }
- tapOn: { id: "wicket-btn-confirm" }
- assertVisible: { id: "score-chip-ball-4", text: "WD\\+W" }
```

(`+` is escaped because Maestro `text` is a regex.)

`flows/e2e-01-standalone-match.yaml` is built from subflows:
- `setup_standalone_m3.yaml`: the new-match wizard with custom overs 3, bowler quota 2, Lions/Tigers, toss Lions bat, openers L1/L2 v T7;
- `score_g1_over1.yaml`, `score_g1_over2.yaml`, `score_g1_over3.yaml`, `score_g1_chase.yaml`;
- then scorecard assertions.

## 8. Accessibility smoke inside E2E

- Every flow runs a final `assertVisible` on at least one element by its **accessibility text** instead of its id. For example, the pad button "Score four runs" is found by `text:` through its label, which proves labels exist.
- TalkBack order and dynamic font scaling are checked manually (ACCEPTANCE AC-E11).

## 9. Flow → spec traceability

| Spec | Flows |
|---|---|
| §92 complete tournament | E2E-06 |
| §4 E2E list (create tournament, create match, score, complete, update standings, qualify, finish) | E2E-06, E2E-01 |
| §23 recovery | E2E-02 |
| §15 undo/redo | E2E-03 |
| §17, §18 extras and wickets | E2E-04 |
| §16, §99 corrections | E2E-05, E2E-09 |
| §31–§34 pools | E2E-07, E2E-08 |
| §47, §48 | E2E-10, E2E-11 |
| §84 backup | E2E-12 |
| §68–§74 themes and tablet | E2E-13 |
| §86, §87 errors and empty states | E2E-14 |
