import { formatResult } from '@/domain/scoring';
import type { MatchSetup, MatchState } from '@/domain/types';

export function resultLine(setup: MatchSetup, state: MatchState): string {
  if (state.result === null) {
    return 'Result recorded.';
  }
  return formatResult(state.result, setup.teams);
}

export function teamNames(setup: MatchSetup): string {
  return `${setup.teams[0].name} v ${setup.teams[1].name}`;
}
