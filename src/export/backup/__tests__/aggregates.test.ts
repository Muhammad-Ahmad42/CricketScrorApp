/** @jest-environment node */
import { markAsCopies, standaloneMatchIds, withoutAggregates } from '../aggregates';
import { IDS, tournamentBackup } from './fixtures/backupData';
import { deepFreeze } from './support/freeze';
import { exportText, previewText } from './support/files';

const data = deepFreeze(tournamentBackup());
const none = { tournamentIds: new Set<string>(), matchIds: new Set<string>() };

describe('withoutAggregates', () => {
  it('drops a whole tournament aggregate and nothing else', () => {
    const kept = withoutAggregates(data, { ...none, tournamentIds: new Set([IDS.tournament]) });
    expect(kept.tournaments).toEqual([]);
    expect(kept.tournamentRules).toEqual([]);
    expect(kept.tournamentTeams).toEqual([]);
    expect(kept.stages).toEqual([]);
    expect(kept.pools).toEqual([]);
    expect(kept.slots).toEqual([]);
    expect(kept.poolEntries).toEqual([]);
    expect(kept.fixtures).toEqual([]);
    expect(kept.overrides).toEqual([]);
    expect(kept.matches.map((row) => row.id)).toEqual([IDS.match2]);
    expect(new Set(kept.matchPlayers.map((row) => row.matchId))).toEqual(new Set([IDS.match2]));
    expect(new Set(kept.matchEvents.map((row) => row.matchId))).toEqual(new Set([IDS.match2]));
    expect(kept.auditEvents.map((row) => row.id)).toEqual(['au-3']);
    expect(kept.teams).toBe(data.teams);
    expect(kept.players).toBe(data.players);
    expect(kept.venues).toBe(data.venues);
    expect(kept.templates).toBe(data.templates);
    expect(previewText(exportText(kept)).ok).toBe(true);
  });

  it('drops a standalone match with its squad and events', () => {
    const kept = withoutAggregates(data, { ...none, matchIds: new Set([IDS.match2]) });
    expect(kept.matches.map((row) => row.id)).toEqual([IDS.match1]);
    expect(kept.matchEvents.every((row) => row.matchId === IDS.match1)).toBe(true);
    expect(kept.matchPlayers.every((row) => row.matchId === IDS.match1)).toBe(true);
    expect(kept.tournaments).toEqual(data.tournaments);
    expect(kept.fixtures).toHaveLength(3);
    expect(previewText(exportText(kept)).ok).toBe(true);
  });

  it('never drops a tournament match through the standalone selection', () => {
    const kept = withoutAggregates(data, { ...none, matchIds: new Set([IDS.match1]) });
    expect(kept.matches.map((row) => row.id)).toEqual([IDS.match1, IDS.match2]);
  });

  it('keeps everything when nothing is selected', () => {
    expect(withoutAggregates(data, none)).toEqual(data);
  });

  it('lists the standalone matches of a backup', () => {
    expect(standaloneMatchIds(data)).toEqual([IDS.match2]);
  });
});

describe('markAsCopies', () => {
  it('suffixes the names of copied tournaments and standalone matches only', () => {
    const marked = markAsCopies(data, { tournamentIds: new Set([IDS.tournament]), matchIds: new Set([IDS.match1, IDS.match2]) });
    expect(marked.tournaments[0].name).toBe('Spring Cup (copy)');
    expect(marked.matches.map((row) => row.title)).toEqual(['Lions v Tigers', 'Friendly (copy)']);
    expect(markAsCopies(data, none)).toEqual(data);
  });
});
