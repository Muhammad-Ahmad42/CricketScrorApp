import type { Href } from 'expo-router';
import type { FixtureId, MatchId, StageId, TournamentId } from '@/domain/types';
import type { TournamentWizardStep } from '@/stores';

const WIZARD_PATHS: { readonly [K in TournamentWizardStep]: Href } = {
  info: '/tournament/new',
  teams: '/tournament/new/teams',
  structure: '/tournament/new/structure',
  rules: '/tournament/new/rules',
  pools: '/tournament/new/pools',
  fixtures: '/tournament/new/fixtures',
  review: '/tournament/new/review',
};

type TournamentSuffix =
  | ''
  | '/standings'
  | '/fixtures'
  | '/fixtures/new'
  | '/pools'
  | '/stages'
  | '/qualification'
  | '/bracket'
  | '/what-if'
  | '/stats'
  | '/audit'
  | '/teams'
  | '/manage';

function tournamentPath(tournamentId: TournamentId, suffix: TournamentSuffix): Href {
  return { pathname: `/tournament/[tournamentId]${suffix}`, params: { tournamentId } };
}

export const routes = {
  tournaments(): Href {
    return '/tournaments';
  },
  wizardStep(step: TournamentWizardStep): Href {
    return WIZARD_PATHS[step];
  },
  dashboard(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '');
  },
  standings(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/standings');
  },
  fixtures(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/fixtures');
  },
  addFixture(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/fixtures/new');
  },
  fixture(tournamentId: TournamentId, fixtureId: FixtureId): Href {
    return { pathname: '/tournament/[tournamentId]/fixtures/[fixtureId]', params: { tournamentId, fixtureId } };
  },
  pools(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/pools');
  },
  stages(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/stages');
  },
  stage(tournamentId: TournamentId, stageId: StageId): Href {
    return { pathname: '/tournament/[tournamentId]/stages/[stageId]', params: { tournamentId, stageId } };
  },
  qualification(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/qualification');
  },
  bracket(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/bracket');
  },
  whatIf(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/what-if');
  },
  stats(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/stats');
  },
  audit(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/audit');
  },
  teams(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/teams');
  },
  manage(tournamentId: TournamentId): Href {
    return tournamentPath(tournamentId, '/manage');
  },
  matchSetup(tournamentId: TournamentId, fixtureId: FixtureId): Href {
    return { pathname: '/match/new', params: { tournamentId, fixtureId } };
  },
  matchScore(matchId: MatchId): Href {
    return { pathname: '/match/[matchId]/score', params: { matchId } };
  },
  matchScorecard(matchId: MatchId): Href {
    return { pathname: '/match/[matchId]/scorecard', params: { matchId } };
  },
} as const;

export function routeParam(value: string | readonly string[] | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  return value?.[0] ?? '';
}
