import type { MatchSummary } from '@/domain/types';
import { played } from './summaries';

const short = { allotted: 12 } as const;

export const POOL_A_TEAMS = ['LIO', 'TIG', 'EAG', 'HAW'] as const;
export const POOL_B_TEAMS = ['BUL', 'COB', 'BEA', 'WOL'] as const;

export const POOL_A: readonly MatchSummary[] = [
  played('m1', { team: 'LIO', runs: 30, balls: 12, wickets: 2 }, { team: 'TIG', runs: 20, balls: 12, wickets: 4 }, short),
  played('m2', { team: 'EAG', runs: 18, balls: 12, wickets: 3 }, { team: 'HAW', runs: 16, balls: 12, wickets: 4 }, short),
  played('m3', { team: 'LIO', runs: 26, balls: 12, wickets: 1 }, { team: 'EAG', runs: 22, balls: 12, wickets: 4 }, short),
  played('m4', { team: 'TIG', runs: 24, balls: 12, wickets: 3 }, { team: 'HAW', runs: 12, balls: 9, wickets: 5, allOut: true }, short),
  played('m5', { team: 'HAW', runs: 20, balls: 12, wickets: 4 }, { team: 'LIO', runs: 21, balls: 10, wickets: 1 }, short),
  played('m6', { team: 'TIG', runs: 25, balls: 12, wickets: 2 }, { team: 'EAG', runs: 19, balls: 12, wickets: 4 }, short),
];

export const POOL_B: readonly MatchSummary[] = [
  played('m7', { team: 'BUL', runs: 28, balls: 12, wickets: 3 }, { team: 'BEA', runs: 22, balls: 12, wickets: 4 }, short),
  played('m8', { team: 'COB', runs: 20, balls: 12, wickets: 2 }, { team: 'WOL', runs: 14, balls: 12, wickets: 4 }, short),
  played('m9', { team: 'BUL', runs: 24, balls: 12, wickets: 2 }, { team: 'COB', runs: 25, balls: 11, wickets: 1 }, short),
  played('m10', { team: 'BEA', runs: 26, balls: 12, wickets: 2 }, { team: 'WOL', runs: 18, balls: 10, wickets: 5, allOut: true }, short),
  played('m11', { team: 'WOL', runs: 15, balls: 12, wickets: 3 }, { team: 'BUL', runs: 16, balls: 8, wickets: 0 }, short),
  played('m12', { team: 'BEA', runs: 21, balls: 12, wickets: 4 }, { team: 'COB', runs: 20, balls: 12, wickets: 3 }, short),
];

export const TEAM_NAMES: Readonly<Record<string, string>> = {
  LIO: 'Lions',
  TIG: 'Tigers',
  EAG: 'Eagles',
  HAW: 'Hawks',
  BUL: 'Bulls',
  COB: 'Cobras',
  BEA: 'Bears',
  WOL: 'Wolves',
};
