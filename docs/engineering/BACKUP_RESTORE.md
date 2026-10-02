# Backup, Restore and PDF Export Design

Engineering design for §83, §84, §93: the pure builders in `src/export/**` (owner WP-export: envelope, canonical JSON, validation, `remap.ts`, PDF HTML) and their orchestration in `BackupService` / `ExportService` (owner WP-services-stores). Contract: `backup.ts` types, `remap.ts` signatures, `BackupRepository`, `BackupService`, `ExportService` in [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md); transactions in [DATABASE.md §6](../architecture/DATABASE.md#6-transactions-per-use-case).

Contents: 1 principles · 2 envelope · 3 export · 4 validation pipeline · 5 conflicts and duplicate detection · 6 ID remapping · 7 atomic import · 8 never-silent rules · 9 PDF generation · 10 backup screen flow · 11 failure handling · 12 tests.

---

## 1. Principles

* **Authoritative data only.** Backups contain what cannot be recomputed: library rows, tournament structure, overrides, audit, match configuration, squads and event logs. Projections (`innings`, `partnerships`, `summary_json`, result / status of started matches, `champion_json`) are rebuilt by replay on import, so a corrupt or hand-edited projection can never be imported.
* **Validate everything before touching the database; write everything in one transaction.**
* **Never silently overwrite** (§84): conflicts are shown per aggregate with what would be lost, and the organizer picks the policy.
* **Pure builders, impure services.** `src/export` builds strings and validates objects; services read / write files (`expo-file-system`), pick documents (`expo-document-picker`), hash (`expo-crypto`), print (`expo-print`) and share (`expo-sharing`).

## 2. Envelope

```json
{
  "format": "scorebook-backup",
  "formatVersion": 1,
  "exportId": "0b6f3c1e-8a4e-4c7e-9d0b-2f3a8e1c5d77",
  "schemaVersion": 1,
  "exportedAt": "2026-09-30T13:41:00.000Z",
  "app": { "name": "Scorebook", "version": "1.0.0", "platform": "android" },
  "scope": { "kind": "tournament", "tournamentId": "5d1e…" },
  "counts": { "venues": 2, "teams": 8, "players": 96, "tournaments": 1, "tournamentRules": 1, "tournamentTeams": 8,
              "stages": 2, "pools": 2, "slots": 6, "poolEntries": 8, "fixtures": 15, "matches": 15,
              "matchPlayers": 330, "matchEvents": 4120, "overrides": 0, "auditEvents": 41, "templates": 0,
              "formatPresets": 0, "settings": 0 },
  "checksum": "9f2c…64 hex…",
  "data": { "venues": [], "teams": [], "…": [] }
}
```

* `formatVersion` versions this JSON shape; `schemaVersion` = `LATEST_SCHEMA_VERSION` of the exporting app (DB shape of the rows).
* `checksum` = SHA-256 (hex) of the **canonical JSON of `data`**: object keys sorted by UTF-16 code unit order at every level, arrays in order, no whitespace, `undefined` members omitted, numbers as `JSON.stringify` prints them, strings as `JSON.stringify` escapes them. The file itself is written with `JSON.stringify(envelope)` (not necessarily canonical); verification re-canonicalises the parsed `data`.
* `counts.settings` is 1 when settings are included (`full` scope only).
* Rows use the domain shapes (camelCase); `matchPlayers` omit name / jersey / role (joined from `players`); `matchEvents` are full `MatchEvent`s (payload + envelope).
* Logos (`logoUri`) are exported as-is but not embedded; on import they are cleared unless the file exists on this device.

## 3. Export

| Scope | Contents |
|---|---|
| `full` | every table, settings |
| `tournament` | the tournament aggregate (rules, memberships, venues links, stages, pools, slots, entries, fixtures, overrides, audit), all its matches (squads, events), and the library rows they reference (teams, players incl. guests, venues) |
| `match` | one standalone match (squad, events, audit entries of its corrections) + referenced library rows |

Flow (`BackupService.exportBackup(scope)`):

1. `BackupRepository.exportData(scope)` in one read transaction (consistent snapshot).
2. `buildEnvelope(data, meta)` (pure): counts, `exportId` (injected id), `exportedAt` (injected clock), `canonicalJson(data)`.
3. `Crypto.digestStringAsync(SHA256, canonical)` → `checksum`.
4. Write to `Paths.cache/exports/` via `new File(dir, name).write(json)`, first to `name.tmp`, then `move` to the final name so a crash never leaves a truncated file under the real name. Names: `scorebook-backup-2026-09-30.json` (full), `tournament-backup-spring-cup-2026-09-30.json` (§84), `match-backup-lions-v-tigers-2026-09-30.json`.
5. Return `{fileUri, envelope}`; the screen calls `ExportService.share(uri, 'application/json')` → `Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save backup' })` so the organizer can save it to Files / Drive / another device. The app itself never uploads anything (§85).

Size: a 128-team season (~500 matches × ~300 events) is ≈ 150 000 events ≈ 35 MB of JSON; export and import both stay in memory (no streaming JSON parser is available), so the service checks `Paths.availableDiskSpace` before writing and refuses files > 100 MB on import with a clear message.

## 4. Validation pipeline (`export/backup/validate.ts` + `BackupService.previewImport`)

Each stage produces `BackupIssue { severity, code, message, path }`; any `error` makes `ImportPreview.ok = false`. Stages stop early only where later stages cannot run.

| # | Stage | Checks | Codes |
|---|---|---|---|
| 1 | Read | pick with `DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true })` (on Android also `'application/octet-stream'`, because some apps and file providers save a `.json` file without a type and the picker would otherwise grey it out; photos, PDFs and other typed files stay hidden, and stages 2–3 reject anything that is not a backup), size ≤ 100 MB, `File.text()` | `IMPORT_INVALID` (service error) |
| 2 | Parse | `JSON.parse` | `INVALID_JSON` (stop) |
| 3 | Envelope | `format = 'scorebook-backup'`; `formatVersion ≤ BACKUP_FORMAT_VERSION`; `schemaVersion ≤ LATEST_SCHEMA_VERSION`; older versions pass through ordered forward mappers (`export/backup/upgrade.ts`, one per version step, adding defaults for new optional keys) | `INVALID_FORMAT`, `UNSUPPORTED_FORMAT_VERSION`, `SCHEMA_TOO_NEW` (stop) |
| 4 | Checksum | null → warning; mismatch → error ("This file was changed or damaged after it was exported.") | `CHECKSUM_MISSING`, `CHECKSUM_MISMATCH` |
| 5 | Structure | every collection an array; every row matches its domain shape: required fields, enums (`MATCH_STATUSES`, event kinds, calls…), ISO date / time formats, integers, JSON sub-shapes (`MatchRules`, `StageConfig`, `SlotSource`, overrides), `counts` equal to array lengths (warning) | `INVALID_VALUE` with `path` e.g. `data.matches[3].teamAId` |
| 6 | Identity | duplicate ids per collection; duplicate `(matchId, seq)` | `DUPLICATE_ID` |
| 7 | References | `collectIdReferences(data)`: each reference resolves inside the file, or — for library entities (teams, players, venues) only — in the database (`BackupRepository.existingIds`); tournament-internal references must resolve inside the file | `MISSING_REFERENCE` (e.g. `data.matchEvents[12].wicket.fielderIds[0]`) |
| 8 | Semantics | cheap invariants the DB would reject at COMMIT: fixture sides are tournament members, a match's fixture belongs to its tournament, squad teams are the match's teams, `status`/`result` pairing, one final per stage, slot roles vs sources | `INVALID_VALUE` |
| 9 | Event logs | per match: seqs contiguous; `normalizeLog(setup, events)` (re-stamps hand-edited stamps — reported as a warning "3 deliveries in Lions v Tigers had outdated batter or bowler names and will be corrected"); `validateLog` must have no error-severity issue | `INVALID_EVENT_LOG` (error), stamp repair (warning) |
| 10 | Conflicts | per aggregate root: `existingIds('tournament' | 'match' | 'team' | 'player' | 'venue' | 'template' | 'preset', ids)`; for tournament / match conflicts, `aggregateFootprint` → local matches and events the file does not contain | `ID_CONFLICT` (warning) + `ImportConflict` |
| 11 | History | `previouslyImportedAt` = `createdAt` of an audit entry `backup_imported` with `entityId = exportId` | — |

Stage 9 dominates the cost (one replay per match, < 50 ms each). The service yields to the event loop between matches (`await` a resolved promise) and reports progress ("Checking match 120 of 500"), and caches the replayed states keyed by `(exportId, checksum)` so the apply step can reuse them.

## 5. Conflicts and duplicate detection

* **Unit = aggregate** (`ImportAggregateKind`): a tournament with everything inside it; a standalone match with its squad and events; each library row. Never a single row of an aggregate, so the result is never a merged tournament.
* **Duplicate import**: the same file (same `exportId`) imported again shows "This backup was already imported on 12 Sep 2026." next to its conflicts; with `skip_existing` nothing is merged.
* **Local-only data**: for each conflicting tournament / match, `localOnly { matches, events }` counts what `replace_existing` would destroy — e.g. "Spring Cup: 3 matches (412 deliveries) scored on this phone are not in the file and will be deleted."

Policies (`ImportConflictPolicy`, chosen explicitly; one policy for the whole import):

| Policy | Tournament / match conflicts | Library conflicts | Non-conflicting aggregates |
|---|---|---|---|
| `skip_existing` | whole aggregate skipped | local rows kept (`keep_local`) | inserted |
| `import_as_copy` | every id in the file remapped (§6), inserted as new aggregates; nothing local changes | remapped too (new library rows) | remapped and inserted |
| `replace_existing` | local aggregate deleted explicitly (`deleteAggregate`, a tournament's matches first), then inserted from the file | updated in place (`update_local`, `ON CONFLICT(id) DO UPDATE`) | inserted |

`import_as_copy` suffixes tournament names and standalone match titles with " (copy)" when the original exists locally, so both are distinguishable in lists. Settings are never applied automatically: the preview offers "Also restore app settings" (full backups only). V1: `applyImport(fileUri, policy)` has no settings flag (gap G-16), so the service never restores settings (`importPlan` drops `data.settings`) and the preview of a file that carries settings says so instead of offering the opt-in: "App settings in this file are not restored. Your current settings stay as they are." The import neither writes nor reloads the settings store.

## 6. ID remapping (`remap.ts`)

One exhaustive visitor walks every id-bearing field of `BackupData`; `collectIdReferences` records references (row keys excluded) with their JSON path and target entity; `remapBackupIds` rewrites row keys and references through `idFor(entity, oldId)`. Sharing the visitor guarantees that validation (stage 7) and copying agree on what a reference is.

| Collection | Row key | References visited |
|---|---|---|
| teams | `id` | `captainId` → players |
| players | `id` | `teamId` |
| tournaments | `id` | `venueIds[]` |
| tournamentRules | (tournamentId) | `tournamentId` |
| tournamentTeams | `id` | `tournamentId`, `teamId`, `replacedByTeamId`, `inheritsFromTeamId` |
| stages | `id` | `tournamentId`, `config.entryRules[].sourceStageId`, `.poolId`, `.teamIds[]` |
| pools | `id` | `stageId` |
| slots | `id` | `stageId`, `source.stageId`, `.poolId`, `.fixtureId`, `.teamId` |
| poolEntries | `id` | `poolId`, `stageId`, `side.teamId` / `side.slotId` |
| fixtures | `id` | `tournamentId`, `stageId`, `poolId`, `sideA/sideB`, `venueId`, `matchId` |
| matches | `id` | `teamAId`, `teamBId`, `venueId`, `tournamentId`, `fixtureId`, `toss.winnerTeamId`, `result.winnerTeamId/loserTeamId`, `winnerTeamId`, tie decider winner |
| matchPlayers | (matchId, playerId) | `matchId`, `playerId`, `teamId` |
| matchEvents | `id` | `matchId`, `actionId`; payload ids: `strikerId`, `nonStrikerId`, `bowlerId`, `wicket.playerOutId`, `wicket.fielderIds[]`, `playerId`, `battingTeamId`, `teamId`, `fielderIds[]`, `absentees[].playerId`, `outcome.winnerTeamId` |
| overrides | `id` | `tournamentId`, `stageId`, `poolId`, `slotId`, `teamId`, `teamIds[]`, `orderedTeamIds[]` |
| auditEvents | `id` | `tournamentId`, `matchId`, `entityId` (when `entityType` names a collection; `backup` / `app` untouched); `previousValue` / `newValue` / `impact` keep original ids (historical text) |
| templates, formatPresets | `id` | — |

`idFor` is called once per distinct `(entity, oldId)` and must be injective; the service passes fresh UUIDs (`expo-crypto randomUUID`). `actionId`s are remapped as a pseudo-entity so action groups stay contiguous. Tested: after remapping a full tournament backup no original id remains in any reference (audit values excepted) and every match replays with zero issues.

## 7. Atomic import (`BackupService.applyImport(fileUri, policy)`)

```
1. re-read and re-validate the file; CONFLICT if (exportId, checksum) differs from the previewed one
2. transform data per policy: drop skipped aggregates | remapBackupIds | list aggregates to replace
3. db.withTransactionAsync(async tx => {
     repos ← createRepositories(tx)
     for each replaced aggregate: repos.backup.deleteAggregate(entity, id)          matches before tournaments
     repos.backup.importData(data, { libraryConflict })                            BackupData order; circular FKs
                                                                                  are DEFERRABLE → checked at COMMIT
     for each imported match: state ← cached replay (or replayMatch)
                              repos.matches.writeProjection(projection(state, SCORING_PROJECTION_VERSION))
                              (yield to the event loop every 20 matches)
     for each imported tournament: bumpRevision; writeChampion(evaluateTournament(snapshot).champion)
     rows ← PRAGMA foreign_key_check → any row: throw (rollback)
     optional settings restore
     audit backup_imported { entityType: 'backup', entityId: exportId, newValue: counts + policy }
   })
4. return ImportReport { imported, skipped, rebuiltMatches }; refresh home, history, tournaments stores
```

Any failure (constraint, deferred FK at COMMIT, disk full, app killed) rolls everything back: the database is exactly as before and the preview can be retried. Because the writer mutex is held for the whole task, live scoring cannot interleave; the import screen is modal and says "Importing — keep Scorebook open".

## 8. Never-silent rules

1. No import without a preview; `applyImport` refuses a file that differs from the previewed one.
2. No `INSERT OR REPLACE`; replacing an aggregate is an explicit delete listed in the preview with its local-only footprint.
3. Library rows are never deleted by an import.
4. Stamp repairs, cleared logos, count mismatches and missing checksums are listed as warnings.
5. Every import is audited (`backup_imported`); re-imports are recognised by `exportId`.
6. Settings change only on explicit opt-in.
7. A tournament delete offers "Export a backup first" (STATE_MACHINES §3).

## 9. PDF generation (`src/export/pdf`, `ExportService`)

### 9.1 Builders (pure)

```
buildScorecardHtml(model: ScorecardDocument, opts: { generatedAt: string }): string
buildTournamentHtml(model: TournamentDocument, opts: { generatedAt: string }): string
```

Models are assembled by `ExportService` from `LiveMatch.state` / `TournamentEvaluation` with the domain formatters (`formatScore`, `formatOvers`, `formatBowlingFigures`, `dismissalText`, `formatResult`, `formatNrr`); builders only lay out strings, so the PDF, the scorecard screen and the live header always agree.

Scorecard sections (§83): title block (match title, teams, venue, date, tournament / stage / fixture label), toss line, result line; per regular innings: batting table (Batter, dismissal, R, B, 4s, 6s, SR; "absent hurt", "c sub (Ali) b Hassan"), extras line "Extras 12 (b 1, lb 3, w 6, nb 2, p 0)", total "Total 165/7 (20 ov, RR 8.25)", did not bat, fall of wickets "1-18 (Ahmed, 0.5), 2-54 (Ali, 6.2)", bowling table (O, M, R, W, Econ, WD, NB), partnerships, over-by-over summary grid (ball tokens per over, runs, score at end); super overs in their own section; for tournament matches the pool standings after the match; footer "Scored with Scorebook · generated 30 Sep 2026, 14:05".

Tournament PDF (§82): information, champion, standings per pool with qualification explanations, knockout bracket as a round-by-round table, results list, statistics leaders.

### 9.2 Print styling

* A4 portrait: `printToFileAsync({ html, width: 595, height: 842, margins })` — `margins` is iOS-only, so the HTML also declares `@page { size: A4; margin: 14mm 12mm; }`.
* Self-contained HTML: inline CSS, no network, system font stack (`-apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`) with `font-variant-numeric: tabular-nums`; the app's bundled fonts are not available to the print WebView.
* Light "print" palette independent of the app theme; information never colour-only (W, 4, 6 as text); `thead { display: table-header-group }` repeats headers across pages; `tr { break-inside: avoid }`.
* Every interpolated string passes `escapeHtml` (`& < > " '`); names with emoji or Urdu script render through the system fonts.
* Logos: embedded as a data URI only when the local file exists and is ≤ 200 KB; otherwise omitted.

### 9.3 Flow

```
ExportService.scorecardPdf(matchId):
  live ← MatchService.load(matchId)                       replay, no writes
  html ← buildScorecardHtml(scorecardModel(live), { generatedAt: clock.now() })
  { uri } ← Print.printToFileAsync({ html, width: 595, height: 842 })
  target ← Paths.cache/exports/"Scorecard - Lions v Tigers - 2026-09-30.pdf" (sanitised, overwrite)
  new File(uri).move(target)
  return target.uri
share(uri, 'application/pdf') → Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle })
```

`Sharing.isAvailableAsync()` false → "Sharing isn't available on this device. The PDF is saved in the app's files." `Print.printAsync({ html })` offers direct printing from the same HTML.

## 10. Backup screen flow

```
BackupScreen
├─ Export: scope picker (Everything / a tournament / a match) → exportBackup → share sheet
└─ Import: pick file → previewImport (progress) →
     ImportPreviewView
       summary: "Tournament backup · Spring Cup · 15 matches · exported 30 Sep 2026 from Scorebook 1.0.0"
       issues: errors (import impossible) / warnings
       conflicts: per aggregate with local-only footprint, "already imported on …"
       policy: Skip existing · Import as a copy · Replace existing (destructive, confirm dialog)
       [x] Also restore app settings (full backups)
     → applyImport → ImportReport ("Imported 1 tournament, 15 matches; skipped 8 existing teams")
```

V1 as built (WP-export settings UI):

* The summary comes from `ImportPreview.source` (additive `ImportSource`, filled by `validate.ts` from the envelope): "Tournament backup · Spring Cup · Exported 30 Sep 2026 from Scorebook 1.0.0 on Android", then "Backup format 1 · data version 1", then the validity line with the counts. `ImportSource.title` is the tournament name or match title of a tournament or match backup, null for a full backup.
* "Also restore app settings" is not offered until G-16 adds a settings flag to `applyImport`; see §5. The preview states that settings are not restored.
* "Export a match" is reached from the scorecard (W-C1), not from this screen; the screen shows "Saved as …" only for a file exported during the current visit.
* Replace is confirmed in a destructive dialog that names the local-only losses. The confirmation is one-shot: a second tap on Replace while the dialog closes, or a tap on Replace after Cancel, does nothing.

## 11. Failure handling (§93)

| Failure | Behaviour |
|---|---|
| Invalid / corrupt JSON, wrong file | preview lists the issue, import impossible |
| Checksum mismatch | error; the organizer is told the file was altered |
| Duplicate import | conflicts + "already imported"; `skip_existing` changes nothing |
| App killed during import | transaction never committed; database unchanged |
| Disk full while exporting | temp file removed, `EXPORT_FAILED` "Couldn't save the backup. Your data is safe." |
| Interrupted PDF generation | no database writes happen; stale files in `cache/exports` older than 24 h are deleted at bootstrap; the action can be retried |
| Engine version newer than the file | old files import; projections are rebuilt with the current engine |

## 12. Tests

Acceptance list: [CONTRACTS.md](../CONTRACTS.md) WP-export and the import items of WP-services-stores. Additional: canonical JSON stability (key order, omitted `undefined`, identical checksum for identical data); every stage-4..9 issue code with a JSON path; remap table coverage (a fixture per row of §6); import-as-copy of the §92 tournament replays every match cleanly and evaluates to the same champion; replace-existing reports local-only matches; failure injection inside the import transaction leaves the DB byte-identical (`foreign_key_check` clean); scorecard HTML contains every §83 section and escapes names.
