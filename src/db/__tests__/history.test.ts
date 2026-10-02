/** @jest-environment node */
import type { InningsLine, Match, MatchListItem, MatchListQuery, MatchResult, MatchStatus, TeamId } from '@/domain/types';
import { createRepositories } from '../repositories';
import type { MatchProjection, Repositories } from '../repositories/contracts';
import { TEST_MATCH_RULES, buildMatch, buildTeamSeed, buildTournament, buildTournamentRules, isoAt, squadsFor, type TeamSeed } from '../testing/builders';
import { goldenMatchEvents } from '../testing/goldenMatch';
import { openTestRepositories } from '../testing/harness';
import { buildMembership } from '../testing/structureBuilders';
import { seedLibrary } from '../testing/tournamentScenario';

const TEAMS: readonly TeamSeed[] = [
  buildTeamSeed('lio', 'Lions', 'LIO'),
  buildTeamSeed('tig', 'Tigers', 'TIG'),
  buildTeamSeed('eag', 'Eagles', 'EAG'),
  buildTeamSeed('haw', 'Hawks', 'HAW'),
];
const PAIRS: readonly (readonly [TeamId, TeamId])[] = [
  ['lio', 'tig'],
  ['eag', 'haw'],
  ['lio', 'eag'],
  ['tig', 'haw'],
  ['lio', 'haw'],
  ['tig', 'eag'],
];
const STATUSES: readonly MatchStatus[] = ['scheduled', 'live', 'paused', 'completed', 'postponed', 'cancelled', 'abandoned'];
const TITLES: Readonly<Record<number, string>> = { 4: 'Big Derby', 11: 'Derby return', 17: 'Final 100% effort', 23: 'Charity_match' };
const COUNT = 30;
const PROJECTED: ReadonlySet<MatchStatus> = new Set(['live', 'paused', 'completed', 'abandoned']);

interface Seeded {
  readonly match: Match;
  readonly order: number;
  readonly innings: readonly InningsLine[];
}

function teamName(id: TeamId): { readonly name: string; readonly short: string } {
  const seed = TEAMS.find((team) => team.team.id === id);
  return { name: seed?.team.name ?? '', short: seed?.team.shortName ?? '' };
}

function resultFor(status: MatchStatus, teamAId: TeamId, teamBId: TeamId): MatchResult | null {
  if (status === 'completed') {
    return { type: 'win', winnerTeamId: teamAId, loserTeamId: teamBId, margin: { kind: 'runs', runs: 12 }, method: 'normal' };
  }
  if (status === 'abandoned') {
    return { type: 'abandoned', reason: 'Rain' };
  }
  return null;
}

function seededMatch(i: number): Seeded {
  const [teamAId, teamBId] = PAIRS[i % PAIRS.length];
  const status = STATUSES[i % STATUSES.length];
  const result = resultFor(status, teamAId, teamBId);
  const day = 1 + ((i * 11) % 28);
  const match = buildMatch({
    id: `h${String(i).padStart(2, '0')}`,
    teamAId,
    teamBId,
    title: TITLES[i] ?? `${teamName(teamAId).name} v ${teamName(teamBId).name} #${i}`,
    status,
    result,
    winnerTeamId: result !== null && result.type === 'win' ? result.winnerTeamId : null,
    tournamentId: i % 3 === 0 ? 'cup' : null,
    scheduledDate: i % 4 === 0 ? null : `2026-05-${String(day).padStart(2, '0')}`,
    scheduledTime: i % 5 === 0 ? null : `${String(8 + (i % 12)).padStart(2, '0')}:30`,
    rules: { ...TEST_MATCH_RULES, oversPerInnings: 5 + (i % 3) },
    createdAt: isoAt(1000 + ((i * 7) % COUNT) * 10),
    updatedAt: isoAt(5000 + ((i * 13) % COUNT) * 10),
  });
  const innings: InningsLine[] = PROJECTED.has(status)
    ? [
        { inningsIndex: 0, kind: 'regular', battingTeamId: teamAId, runs: 40 + i, wickets: i % 10, legalBalls: 30, ballsPerOver: 6, status: 'complete', completionReason: 'overs_complete' },
        { inningsIndex: 1, kind: 'regular', battingTeamId: teamBId, runs: 20 + i, wickets: 2, legalBalls: 12 + (i % 6), ballsPerOver: 6, status: status === 'completed' || status === 'abandoned' ? 'complete' : 'in_progress', completionReason: status === 'completed' ? 'all_out' : status === 'abandoned' ? 'match_ended' : null },
      ]
    : [];
  return { match, order: i, innings };
}

const SEEDED: readonly Seeded[] = Array.from({ length: COUNT }, (_, i) => seededMatch(i));

function projectionOf(seeded: Seeded): MatchProjection {
  const { match } = seeded;
  return {
    matchId: match.id,
    projectionVersion: 1,
    status: match.status,
    result: match.result,
    winnerTeamId: match.winnerTeamId,
    summary: null,
    startedAt: match.startedAt,
    completedAt: match.completedAt,
    innings: seeded.innings.map((line) => ({
      ...line,
      superOverRound: null,
      bowlingTeamId: line.battingTeamId === match.teamAId ? match.teamBId : match.teamAId,
      maxBalls: 30,
      target: line.inningsIndex === 1 ? 41 + seeded.order : null,
      targetRevised: false,
      extras: { wides: 1, noBalls: 0, byes: 0, legByes: 0, penalty: 0, total: 1 },
    })),
    partnerships: [],
    updatedAt: match.updatedAt,
  };
}

async function seedHistory(): Promise<{ readonly repos: Repositories; readonly db: Awaited<ReturnType<typeof openTestRepositories>>['db'] }> {
  const { db, repos } = await openTestRepositories();
  await seedLibrary(db, TEAMS);
  await db.withTransactionAsync(async (tx) => {
    const scoped = createRepositories(tx);
    await scoped.tournaments.insert(buildTournament({ id: 'cup', name: 'Spring Cup' }), buildTournamentRules('cup'));
    await scoped.tournaments.upsertTournamentTeams(TEAMS.map((seed, index) => buildMembership('cup', seed.team.id, index + 1)));
    for (const seeded of SEEDED) {
      const [a, b] = [TEAMS.find((t) => t.team.id === seeded.match.teamAId), TEAMS.find((t) => t.team.id === seeded.match.teamBId)];
      await scoped.matches.insert(seeded.match, a !== undefined && b !== undefined ? squadsFor(a, b) : []);
      if (PROJECTED.has(seeded.match.status)) {
        await scoped.matches.writeProjection(projectionOf(seeded));
      }
    }
  });
  return { db, repos };
}

function compareText(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

function referenceList(query: MatchListQuery): string[] {
  const needle = query.search?.trim().toLowerCase() ?? '';
  const filtered = SEEDED.filter(({ match }) => {
    if (query.statuses !== undefined && !query.statuses.includes(match.status)) {
      return false;
    }
    if (query.tournamentId !== undefined && match.tournamentId !== query.tournamentId) {
      return false;
    }
    if (query.teamId !== undefined && match.teamAId !== query.teamId && match.teamBId !== query.teamId) {
      return false;
    }
    if (needle !== '') {
      const haystack = [match.title, teamName(match.teamAId).name, teamName(match.teamAId).short, teamName(match.teamBId).name, teamName(match.teamBId).short];
      return haystack.some((text) => text.toLowerCase().includes(needle));
    }
    return true;
  });
  const byCreated = (x: Seeded, y: Seeded): number => compareText(x.match.createdAt, y.match.createdAt) || x.order - y.order;
  const sorted = [...filtered].sort((x, y) => {
    switch (query.sort ?? 'recent') {
      case 'recent':
        return -byCreated(x, y);
      case 'oldest':
        return byCreated(x, y);
      case 'scheduled':
        return compareText(x.match.scheduledDate, y.match.scheduledDate) || compareText(x.match.scheduledTime, y.match.scheduledTime) || byCreated(x, y);
    }
  });
  const offset = query.offset ?? 0;
  const end = query.limit === undefined ? undefined : offset + query.limit;
  return sorted.slice(offset, end).map((entry) => entry.match.id);
}

function referenceResumable(dismissed: ReadonlySet<string>, forPrompt: boolean): string[] {
  return SEEDED.filter(({ match }) => (match.status === 'live' || match.status === 'paused') && !(forPrompt && dismissed.has(match.id)))
    .sort((x, y) => -(compareText(x.match.updatedAt, y.match.updatedAt) || x.order - y.order))
    .map((entry) => entry.match.id);
}

describe('history list and resume queries over 30 matches (IT-DB-10)', () => {
  it('matches the reference model for every filter, search and sort combination', async () => {
    const { repos } = await seedHistory();
    const queries: MatchListQuery[] = [];
    for (const sort of ['recent', 'oldest', 'scheduled'] as const) {
      queries.push(
        { sort },
        { sort, statuses: ['completed', 'abandoned'] },
        { sort, statuses: ['live', 'paused'] },
        { sort, statuses: [] },
        { sort, tournamentId: 'cup' },
        { sort, tournamentId: null },
        { sort, teamId: 'haw' },
        { sort, teamId: 'lio', statuses: ['scheduled', 'postponed', 'completed'] },
        { sort, search: 'derby' },
        { sort, search: 'TIGERS' },
        { sort, search: 'eag' },
        { sort, search: '100%' },
        { sort, search: '_' },
        { sort, search: '#1' },
        { sort, search: 'hawks', tournamentId: 'cup', statuses: ['completed', 'live', 'scheduled'] },
      );
    }
    for (const query of queries) {
      const actual = (await repos.matches.list(query)).map((item) => item.id);
      expect([JSON.stringify(query), actual]).toEqual([JSON.stringify(query), referenceList(query)]);
    }
  });

  it('pages through every sort without gaps or duplicates', async () => {
    const { repos } = await seedHistory();
    for (const sort of ['recent', 'oldest', 'scheduled'] as const) {
      const pages: string[] = [];
      for (let offset = 0; offset < COUNT + 7; offset += 7) {
        const page = (await repos.matches.list({ sort, limit: 7, offset })).map((item) => item.id);
        expect(page).toEqual(referenceList({ sort, limit: 7, offset }));
        pages.push(...page);
      }
      expect(pages).toEqual(referenceList({ sort }));
      expect(new Set(pages).size).toBe(COUNT);
    }
    expect(await repos.matches.list({ limit: 0 })).toEqual([]);
  });

  it('pages a search through every sort and returns the same items as the unsearched list', async () => {
    const { repos } = await seedHistory();
    const everything = new Map((await repos.matches.list({})).map((item) => [item.id, item]));
    for (const sort of ['recent', 'oldest', 'scheduled'] as const) {
      for (const search of ['lions', 'TIG', ' derby ']) {
        const all = referenceList({ sort, search });
        expect(all.length).toBeGreaterThan(1);
        const pages: MatchListItem[] = [];
        for (let offset = 0; offset < all.length + 3; offset += 3) {
          const page = await repos.matches.list({ sort, search, limit: 3, offset });
          expect(page.map((item) => item.id)).toEqual(referenceList({ sort, search, limit: 3, offset }));
          pages.push(...page);
        }
        expect(pages.map((item) => item.id)).toEqual(all);
        expect(pages).toEqual(all.map((id) => everything.get(id)));
      }
    }
    expect(await repos.matches.list({ search: 'lions', limit: 0 })).toEqual([]);
    expect(await repos.matches.list({ search: 'no such team' })).toEqual([]);
  });

  it('search folds case beyond ASCII for titles and team names (NFR-S-17)', async () => {
    const { db, repos } = await openTestRepositories();
    const elan = buildTeamSeed('elan', 'Élan XI', 'ÉLN');
    const odessa = buildTeamSeed('ode', 'Одесса', 'ОДС');
    await seedLibrary(db, [elan, odessa, ...TEAMS]);
    await repos.matches.insert(buildMatch({ id: 'u1', teamAId: 'elan', teamBId: 'lio', title: 'Élan v Lions', createdAt: isoAt(1) }), []);
    await repos.matches.insert(buildMatch({ id: 'u2', teamAId: 'ode', teamBId: 'tig', title: 'ФИНАЛ', createdAt: isoAt(2) }), []);
    await repos.matches.insert(buildMatch({ id: 'u3', teamAId: 'eag', teamBId: 'haw', title: 'Elan derby', createdAt: isoAt(3) }), []);
    const ids = async (query: MatchListQuery): Promise<string[]> => (await repos.matches.list(query)).map((item) => item.id);
    expect(await ids({ search: 'élan' })).toEqual(['u1']);
    expect(await ids({ search: 'ÉLAN XI' })).toEqual(['u1']);
    expect(await ids({ search: 'elan' })).toEqual(['u3']);
    expect(await ids({ search: 'одесса' })).toEqual(['u2']);
    expect(await ids({ search: 'финал' })).toEqual(['u2']);
    expect(await ids({ search: 'финал', statuses: ['completed'] })).toEqual([]);
    expect(await ids({ search: 'l', sort: 'oldest', limit: 1, offset: 1 })).toEqual(['u3']);
  });

  it('carries team refs, overs, tournament names and innings lines from the projections', async () => {
    const { repos } = await seedHistory();
    const items = await repos.matches.list({ sort: 'oldest' });
    const byId = new Map<string, MatchListItem>(items.map((item) => [item.id, item]));
    for (const seeded of SEEDED) {
      const item = byId.get(seeded.match.id);
      expect(item).toEqual({
        id: seeded.match.id,
        title: seeded.match.title,
        status: seeded.match.status,
        result: seeded.match.result,
        teamA: { id: seeded.match.teamAId, name: teamName(seeded.match.teamAId).name, shortName: teamName(seeded.match.teamAId).short },
        teamB: { id: seeded.match.teamBId, name: teamName(seeded.match.teamBId).name, shortName: teamName(seeded.match.teamBId).short },
        oversPerInnings: seeded.match.rules.oversPerInnings,
        innings: seeded.innings,
        scheduledDate: seeded.match.scheduledDate,
        tournamentId: seeded.match.tournamentId,
        tournamentName: seeded.match.tournamentId === null ? null : 'Spring Cup',
        resumeDismissedAt: null,
        updatedAt: seeded.match.updatedAt,
      });
    }
  });

  it('lists live and paused matches for Continue Match and hides SAVE & EXIT ones from the prompt until the next append', async () => {
    const { db, repos } = await seedHistory();
    const resumable = referenceResumable(new Set(), false);
    expect(resumable.length).toBeGreaterThan(4);
    expect((await repos.matches.findResumable()).map((item) => item.id)).toEqual(resumable);
    expect((await repos.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual(resumable);
    const dismissed = new Set([resumable[0], resumable[2]]);
    for (const id of dismissed) {
      await repos.matches.setResumeDismissed(id, isoAt(9000));
    }
    expect((await repos.matches.findResumable({ forPrompt: true })).map((item) => item.id)).toEqual(referenceResumable(dismissed, true));
    expect((await repos.matches.findResumable()).map((item) => item.id)).toEqual(resumable);
    expect((await repos.matches.findResumable()).find((item) => item.id === resumable[0])?.resumeDismissedAt).toBe(isoAt(9000));
    const target = SEEDED.find((entry) => entry.match.id === resumable[0]);
    if (target === undefined) {
      throw new Error('missing seeded match');
    }
    const opening = goldenMatchEvents({
      matchId: target.match.id,
      batFirst: { teamId: target.match.teamAId, playerIds: TEAMS.find((t) => t.team.id === target.match.teamAId)?.players.map((p) => p.id) ?? [] },
      bowlFirst: { teamId: target.match.teamBId, playerIds: TEAMS.find((t) => t.team.id === target.match.teamBId)?.players.map((p) => p.id) ?? [] },
    }).slice(0, 2);
    await db.withTransactionAsync(async (tx) => {
      const scoped = createRepositories(tx);
      await scoped.events.append(opening);
      await scoped.matches.writeProjection({ ...projectionOf(target), updatedAt: isoAt(9999) });
      await scoped.matches.setResumeDismissed(target.match.id, null);
    });
    const prompt = (await repos.matches.findResumable({ forPrompt: true })).map((item) => item.id);
    expect(prompt[0]).toBe(target.match.id);
    expect(prompt).not.toContain(resumable[2]);
  });
});
