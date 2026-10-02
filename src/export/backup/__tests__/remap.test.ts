/** @jest-environment node */
import { validateLog } from '@/domain/scoring';
import type { BackupData, Id, MatchEvent } from '@/domain/types';
import { visitBackupIds, type IdSite } from '../ids';
import { collectIdReferences, remapBackupIds, type BackupEntity, type IdReference } from '../remap';
import { matchLogJobs } from '../validation/eventLogs';
import { EAGLES, IDS, LIONS, tournamentBackup } from './fixtures/backupData';
import { validOneOverLog } from './fixtures/events';
import { deepFreeze, engineReady } from './support/freeze';

function tournamentBackupWithValidLogs(): BackupData {
  const data = tournamentBackup();
  const friendly = validOneOverLog(IDS.match2, {
    battingFirst: { teamId: IDS.eagles, players: EAGLES },
    chasing: { teamId: IDS.lions, players: LIONS },
  });
  return {
    ...data,
    matches: data.matches.map((row) => (row.id === IDS.match2 ? { ...row, toss: { winnerTeamId: IDS.eagles, decision: 'bat' as const } } : row)),
    matchEvents: [...data.matchEvents.filter((event) => event.matchId !== IDS.match2), ...friendly],
  };
}

function sites(data: BackupData): IdSite[] {
  const found: IdSite[] = [];
  visitBackupIds(data, (site) => {
    found.push(site);
    return site.id;
  });
  return found;
}

function counterIdFor() {
  const calls: { entity: BackupEntity; oldId: Id }[] = [];
  const idFor = (entity: BackupEntity, oldId: Id): Id => {
    calls.push({ entity, oldId });
    return `new-${entity}-${calls.length}`;
  };
  return { calls, idFor };
}

function eventIndex(data: BackupData, predicate: (event: MatchEvent) => boolean): number {
  const index = data.matchEvents.findIndex(predicate);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

function refAt(refs: readonly IdReference[], path: string): IdReference | undefined {
  return refs.find((ref) => ref.path === path);
}

describe('collectIdReferences', () => {
  const data = deepFreeze(tournamentBackup());
  const refs = collectIdReferences(data);

  it('U-BKP-01 includes ids inside match event payloads', () => {
    const dismissed = eventIndex(data, (event) => event.kind === 'batter_dismissed');
    const runOut = eventIndex(data, (event) => event.kind === 'delivery' && event.wicket?.type === 'run_out');
    const ended = eventIndex(data, (event) => event.kind === 'innings_ended');
    const matchEnded = eventIndex(data, (event) => event.kind === 'match_ended' && event.outcome.type === 'tie_decided');
    const penalty = eventIndex(data, (event) => event.kind === 'penalty_awarded');
    const started = eventIndex(data, (event) => event.kind === 'innings_started');
    expect(refAt(refs, `data.matchEvents[${dismissed}].fielderIds[0]`)).toEqual({
      path: `data.matchEvents[${dismissed}].fielderIds[0]`,
      entity: 'players',
      id: 'p-eagles-3',
    });
    expect(refAt(refs, `data.matchEvents[${dismissed}].playerId`)?.entity).toBe('players');
    expect(refAt(refs, `data.matchEvents[${runOut}].wicket.playerOutId`)?.id).toBe('p-lions-2');
    expect(refAt(refs, `data.matchEvents[${runOut}].wicket.fielderIds[1]`)?.id).toBe('p-eagles-2');
    expect(refAt(refs, `data.matchEvents[${runOut}].nonStrikerId`)?.entity).toBe('players');
    expect(refAt(refs, `data.matchEvents[${ended}].absentees[0].playerId`)?.id).toBe('p-lions-3');
    expect(refAt(refs, `data.matchEvents[${matchEnded}].outcome.winnerTeamId`)).toMatchObject({ entity: 'teams', id: IDS.eagles });
    expect(refAt(refs, `data.matchEvents[${penalty}].teamId`)).toMatchObject({ entity: 'teams', id: IDS.lions });
    expect(refAt(refs, `data.matchEvents[${started}].battingTeamId`)).toMatchObject({ entity: 'teams', id: IDS.lions });
    expect(refAt(refs, `data.matchEvents[${started}].matchId`)).toMatchObject({ entity: 'matches' });
  });

  it('U-BKP-01 includes stage entry rules, slot sources and sides', () => {
    expect(refAt(refs, 'data.stages[0].config.entryRules[0].teamIds[3]')).toMatchObject({ entity: 'teams', id: IDS.falcons });
    expect(refAt(refs, 'data.stages[1].config.entryRules[0].sourceStageId')).toMatchObject({ entity: 'stages', id: IDS.groups });
    expect(refAt(refs, 'data.stages[1].config.entryRules[1].poolId')).toMatchObject({ entity: 'pools', id: IDS.poolA });
    expect(refAt(refs, 'data.stages[1].config.entryRules[4].sourceStageId')?.entity).toBe('stages');
    expect(refAt(refs, 'data.stages[1].config.entryRules[6].teamIds[0]')?.id).toBe(IDS.eagles);
    expect(refAt(refs, 'data.slots[0].source.stageId')).toMatchObject({ entity: 'stages', id: IDS.groups });
    expect(refAt(refs, 'data.slots[0].source.poolId')).toMatchObject({ entity: 'pools', id: IDS.poolA });
    expect(refAt(refs, 'data.slots[4].source.teamId')).toMatchObject({ entity: 'teams', id: IDS.eagles });
    expect(refAt(refs, 'data.slots[5].source.stageId')?.id).toBe(IDS.knockout);
    expect(refAt(refs, 'data.slots[7].source.fixtureId')).toMatchObject({ entity: 'fixtures', id: IDS.fixture1 });
    expect(refAt(refs, 'data.poolEntries[0].side.teamId')).toMatchObject({ entity: 'teams', id: IDS.lions });
    expect(refAt(refs, 'data.fixtures[2].sideA.slotId')).toMatchObject({ entity: 'slots', id: 'slot-a1' });
    expect(refAt(refs, 'data.fixtures[0].sideB.teamId')?.id).toBe(IDS.tigers);
    expect(refAt(refs, 'data.fixtures[0].matchId')).toMatchObject({ entity: 'matches', id: IDS.match1 });
    expect(refAt(refs, 'data.fixtures[0].matchSides.teamAId')?.entity).toBe('teams');
  });

  it('U-BKP-01 includes override payloads, venue lists, memberships and captains', () => {
    const overrides = data.overrides.map((row) => row.kind);
    const at = (kind: string) => overrides.indexOf(kind as (typeof overrides)[number]);
    expect(refAt(refs, `data.overrides[${at('qualification')}].teamId`)?.entity).toBe('teams');
    expect(refAt(refs, `data.overrides[${at('points_adjustment')}].teamId`)?.id).toBe(IDS.lions);
    expect(refAt(refs, `data.overrides[${at('tie_resolution')}].orderedTeamIds[1]`)?.id).toBe(IDS.lions);
    expect(refAt(refs, `data.overrides[${at('slot_assignment')}].teamId`)?.entity).toBe('teams');
    expect(refAt(refs, `data.overrides[${at('expunge_results')}].teamId`)?.id).toBe(IDS.hawks);
    expect(refAt(refs, `data.overrides[${at('expunge_results')}].stageId`)).toBeUndefined();
    expect(refAt(refs, `data.overrides[${at('champion')}].teamIds[0]`)?.id).toBe(IDS.tigers);
    expect(refAt(refs, 'data.tournaments[0].venueIds[1]')).toMatchObject({ entity: 'venues', id: IDS.venue2 });
    expect(refAt(refs, 'data.tournamentTeams[3].replacedByTeamId')?.id).toBe(IDS.falcons);
    expect(refAt(refs, 'data.tournamentTeams[4].inheritsFromTeamId')?.id).toBe(IDS.hawks);
    expect(refAt(refs, 'data.teams[0].captainId')).toMatchObject({ entity: 'players', id: 'p-lions-1' });
    expect(refAt(refs, 'data.matches[0].result.winnerTeamId')?.id).toBe(IDS.tigers);
    expect(refAt(refs, 'data.matches[0].toss.winnerTeamId')?.id).toBe(IDS.lions);
    expect(refAt(refs, 'data.matchPlayers[0].playerId')?.entity).toBe('players');
    expect(refAt(refs, 'data.tournamentRules[0].tournamentId')?.entity).toBe('tournaments');
  });

  it('treats override stage, pool and slot ids as history links: visited, but never must-resolve references', () => {
    const overrides = data.overrides.map((row) => row.kind);
    const at = (kind: string) => overrides.indexOf(kind as (typeof overrides)[number]);
    const historical = [
      `data.overrides[${at('qualification')}].stageId`,
      `data.overrides[${at('qualification')}].slotId`,
      `data.overrides[${at('qualification')}].poolId`,
      `data.overrides[${at('points_adjustment')}].stageId`,
      `data.overrides[${at('tie_resolution')}].stageId`,
      `data.overrides[${at('slot_assignment')}].slotId`,
    ];
    historical.forEach((path) => expect(refAt(refs, path)).toBeUndefined());
    const links = sites(data).filter((site) => /^data\.overrides\[\d+\]\.(?:stageId|poolId|slotId)$/.test(site.path));
    expect(links.map((site) => site.path)).toEqual(expect.arrayContaining(historical));
    expect(links.every((site) => site.role === 'link')).toBe(true);
    expect(links.find((site) => site.path === `data.overrides[${at('qualification')}].slotId`)).toMatchObject({ entity: 'slots', id: 'slot-a1' });
    expect(links.find((site) => site.path === `data.overrides[${at('slot_assignment')}].slotId`)).toMatchObject({ entity: 'slots', id: 'slot-manual' });
  });

  it('U-BKP-01 excludes row keys, action groups and audit values', () => {
    expect(refs.some((ref) => ref.path.endsWith('.id'))).toBe(false);
    expect(refs.some((ref) => ref.path.endsWith('.actionId'))).toBe(false);
    expect(refs.some((ref) => /previousValue|newValue|impact|entityId/.test(ref.path))).toBe(false);
    expect(refAt(refs, 'data.auditEvents[1].matchId')).toMatchObject({ entity: 'matches', id: IDS.match1 });
    expect(refAt(refs, 'data.auditEvents[2].tournamentId')).toBeUndefined();
  });

  it('lists references in document order', () => {
    const collections = refs.map((ref) => /^data\.(\w+)\[/.exec(ref.path)?.[1] ?? '');
    const order = Object.keys(data);
    const positions = collections.map((name) => order.indexOf(name));
    expect(positions.every((position, index) => index === 0 || position >= positions[index - 1])).toBe(true);
    const wicketPaths = refs.filter((ref) => ref.path.includes('.wicket.')).map((ref) => ref.path.replace(/^.*\.wicket\./, ''));
    expect(wicketPaths).toEqual(['playerOutId', 'fielderIds[0]', 'playerOutId', 'fielderIds[0]', 'fielderIds[1]']);
  });

  it('returns an empty list for an empty backup', () => {
    const empty = Object.fromEntries(Object.keys(data).map((key) => [key, key === 'settings' ? null : []])) as unknown as BackupData;
    expect(collectIdReferences(empty)).toEqual([]);
  });
});

describe('remapBackupIds', () => {
  const data = deepFreeze(tournamentBackup());

  it('U-BKP-02 leaves no original id in any row key or reference', () => {
    const originalIds = new Set(sites(data).map((site) => site.id));
    const { idFor } = counterIdFor();
    const remapped = remapBackupIds(data, idFor);
    const after = sites(remapped);
    expect(after.length).toBe(sites(data).length);
    expect(after.filter((site) => originalIds.has(site.id))).toEqual([]);
    expect(collectIdReferences(remapped).filter((ref) => originalIds.has(ref.id))).toEqual([]);
  });

  it('U-BKP-02 calls idFor once per distinct entity and id', () => {
    const { calls, idFor } = counterIdFor();
    remapBackupIds(data, idFor);
    const keys = calls.map((call) => `${call.entity}|${call.oldId}`);
    expect(new Set(keys).size).toBe(keys.length);
    const distinct = new Set(sites(data).map((site) => `${site.entity}|${site.id}`));
    expect(keys.length).toBe(distinct.size);
  });

  it('U-BKP-02 keeps audit values and non-id fields as they were', () => {
    const remapped = remapBackupIds(data, counterIdFor().idFor);
    remapped.auditEvents.forEach((row, index) => {
      expect(row.previousValue).toEqual(data.auditEvents[index].previousValue);
      expect(row.newValue).toEqual(data.auditEvents[index].newValue);
      expect(row.impact).toEqual(data.auditEvents[index].impact);
      expect(row.summary).toBe(data.auditEvents[index].summary);
    });
    expect(remapped.auditEvents[2].entityId).toBe('export-previous');
    expect(remapped.auditEvents[1].entityId).toBe(remapped.matches[0].id);
    expect(remapped.auditEvents[4].entityId).toBe(remapped.tournaments[0].id);
    expect(remapped.auditEvents[3].entityId).not.toBe('stage-deleted-long-ago');
    expect(remapped.teams.map((row) => row.name)).toEqual(data.teams.map((row) => row.name));
    expect(remapped.settings).toEqual(data.settings);
    expect(remapped.matches[0].rules).toEqual(data.matches[0].rules);
    expect(remapped.formatPresets[0].rules).toEqual(data.formatPresets[0].rules);
  });

  it('keeps every relationship consistent', () => {
    const remapped = remapBackupIds(data, counterIdFor().idFor);
    const lions = remapped.teams[0].id;
    expect(remapped.players[0].teamId).toBe(lions);
    expect(remapped.teams[0].captainId).toBe(remapped.players[0].id);
    expect(remapped.fixtures[0].matchId).toBe(remapped.matches[0].id);
    expect(remapped.matches[0].fixtureId).toBe(remapped.fixtures[0].id);
    expect(remapped.matches[0].winnerTeamId).toBe(remapped.teams[1].id);
    expect(remapped.slots[5].source).toMatchObject({ stageId: remapped.stages[1].id });
    expect(remapped.fixtures[2].sideA).toEqual({ kind: 'slot', slotId: remapped.slots[0].id });
    const slotAssignment = remapped.overrides[data.overrides.findIndex((row) => row.kind === 'slot_assignment')];
    const manualSlot = remapped.slots[data.slots.findIndex((row) => row.id === 'slot-manual')];
    expect(slotAssignment).toMatchObject({ kind: 'slot_assignment', slotId: manualSlot.id });
    expect(remapped.matchEvents.every((event) => remapped.matches.some((row) => row.id === event.matchId))).toBe(true);
  });

  it('keeps action groups together and apart', () => {
    const remapped = remapBackupIds(data, counterIdFor().idFor);
    data.matchEvents.forEach((event, i) => {
      data.matchEvents.forEach((other, j) => {
        const same = event.actionId === other.actionId;
        expect(remapped.matchEvents[i].actionId === remapped.matchEvents[j].actionId).toBe(same);
      });
    });
    expect(remapped.matchEvents[4].actionId).not.toBe(data.matchEvents[4].actionId);
  });

  it('never mutates its input', () => {
    const before = JSON.stringify(data);
    remapBackupIds(data, counterIdFor().idFor);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('U-BKP-04 references of the copy are the original references mapped through idFor', () => {
    const mapping = new Map<string, Id>();
    const idFor = (entity: BackupEntity, oldId: Id): Id => {
      const next = `copy-${mapping.size + 1}`;
      mapping.set(`${entity}|${oldId}`, next);
      return next;
    };
    const remapped = remapBackupIds(data, idFor);
    const expected = collectIdReferences(data).map((ref) => ({ ...ref, id: mapping.get(`${ref.entity}|${ref.id}`) }));
    expect(collectIdReferences(remapped)).toEqual(expected);
  });

  const ready = engineReady(() => validateLog(matchLogJobs(tournamentBackup())[0].setup, []));

  (ready ? it : it.skip)('U-BKP-03 every remapped match replays exactly like the original', () => {
    const remapped = remapBackupIds(data, counterIdFor().idFor);
    const before = matchLogJobs(data);
    const after = matchLogJobs(remapped);
    expect(after.length).toBe(before.length);
    before.forEach((job, index) => {
      const original = validateLog(job.setup, job.events);
      const copy = validateLog(after[index].setup, after[index].events);
      expect(copy.ok).toBe(original.ok);
      expect(copy.state.issues.map((issue) => issue.code)).toEqual(original.state.issues.map((issue) => issue.code));
    });
  });

  (ready ? it : it.skip)('U-BKP-03 every match of a remapped tournament backup replays with zero error issues', () => {
    const playable = deepFreeze(tournamentBackupWithValidLogs());
    const remapped = remapBackupIds(playable, counterIdFor().idFor);
    const jobs = matchLogJobs(remapped);
    expect(jobs).toHaveLength(2);
    jobs.forEach((job) => {
      const result = validateLog(job.setup, job.events);
      expect(result.ok).toBe(true);
      expect(result.state.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(result.state.lifecycle).toBe('completed');
    });
  });
});
