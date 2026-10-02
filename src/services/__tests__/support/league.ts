import { BASE_MATCH_RULES, rulesForOvers } from '@/domain/scoring';
import { builtinTemplates, instantiateTemplate } from '@/domain/tournament';
import type { Fixture, Stage, TournamentEvaluation, TournamentSnapshot } from '@/domain/types';
import type { AppServices } from '../../contracts';
import { expectOk } from './app';
import { createSide, sixNames, type Side } from './sides';
import { fixtureBetween } from './tournament';

export const LEAGUE_RULES = rulesForOvers(2, { ...BASE_MATCH_RULES, playersPerSide: 6 });
export const LEAGUE_TEAMS = ['Lions', 'Tigers', 'Eagles', 'Hawks'] as const;
export type LeagueTeam = (typeof LEAGUE_TEAMS)[number];

export interface League {
  readonly tournamentId: string;
  readonly stage: Stage;
  readonly sides: Readonly<Record<LeagueTeam, Side>>;
  evaluate(): Promise<{ readonly snapshot: TournamentSnapshot; readonly evaluation: TournamentEvaluation }>;
  fixture(a: LeagueTeam, b: LeagueTeam): Promise<Fixture>;
  sidesOf(fixture: Fixture): readonly [Side, Side];
}

export async function createLeague(app: AppServices, name = 'Spring League'): Promise<League> {
  const make = (team: LeagueTeam) => createSide(app, `${team} ${name.split(' ')[0]}`, team.slice(0, 3).toUpperCase(), sixNames(team));
  const sides: Record<LeagueTeam, Side> = { Lions: await make('Lions'), Tigers: await make('Tigers'), Eagles: await make('Eagles'), Hawks: await make('Hawks') };
  const tournament = expectOk(
    await app.tournaments.create({
      name,
      season: '2026',
      description: null,
      organizer: null,
      startDate: null,
      endDate: null,
      venueIds: [],
      structureKind: 'league',
      templateId: 'builtin:4-team-league',
    }),
  );
  expectOk(await app.tournaments.addTeams(tournament.id, LEAGUE_TEAMS.map((team, index) => ({ teamId: sides[team].team.id, seed: index + 1 }))));
  expectOk(await app.tournaments.setStatus(tournament.id, 'registration', null));
  const template = builtinTemplates().find((entry) => entry.id === 'builtin:4-team-league');
  if (template === undefined) {
    throw new Error('template missing');
  }
  const structure = instantiateTemplate(template, { tournamentId: tournament.id, now: '2026-05-01T09:00:00.000Z', ids: app.newId });
  const [stage] = structure.stages;
  const [pool] = structure.pools;
  expectOk(
    await app.tournaments.saveStructure(tournament.id, {
      rules: { ...structure.rules, defaultMatchRules: LEAGUE_RULES },
      stages: structure.stages,
      pools: structure.pools,
      slots: structure.slots,
      poolEntries: LEAGUE_TEAMS.map((team, index) => ({ id: app.newId(), poolId: pool.id, stageId: stage.id, side: { kind: 'team' as const, teamId: sides[team].team.id }, seed: index + 1 })),
    }),
  );
  expectOk(await app.tournaments.setStatus(tournament.id, 'structure_configured', null));
  expectOk(await app.tournaments.setStatus(tournament.id, 'pools_configured', null));
  const plan = expectOk(await app.tournaments.generateFixtures(stage.id));
  expectOk(await app.tournaments.confirmFixtures(stage.id, plan));
  expectOk(await app.tournaments.setStatus(tournament.id, 'fixtures_generated', null));
  const evaluate = async () => expectOk(await app.tournaments.evaluate(tournament.id));
  return {
    tournamentId: tournament.id,
    stage,
    sides,
    evaluate,
    async fixture(a, b) {
      return fixtureBetween((await evaluate()).snapshot, sides[a], sides[b]);
    },
    sidesOf(fixture) {
      const find = (side: Fixture['sideA']) => {
        const found = Object.values(sides).find((entry) => side.kind === 'team' && side.teamId === entry.team.id);
        if (found === undefined) {
          throw new Error('side missing');
        }
        return found;
      };
      return [find(fixture.sideA), find(fixture.sideB)];
    },
  };
}
