import type { TournamentId, TournamentListItem } from '@/domain/types';
import { countOf, fileNameOf } from './text';

export interface TournamentTargetVM {
  readonly id: TournamentId;
  readonly title: string;
  readonly detail: string;
  readonly testID: string;
}

export function tournamentTargets(items: readonly TournamentListItem[]): readonly TournamentTargetVM[] {
  return items.map((item, index) => {
    const parts = [countOf(item.teamCount, { one: 'team', many: 'teams' }), `${item.fixturesDone}/${item.fixturesTotal} matches played`];
    return {
      id: item.id,
      title: item.name,
      detail: (item.season ? [item.season, ...parts] : parts).join(' · '),
      testID: `backup-row-tournament-${index + 1}`,
    };
  });
}

export function exportedFileText(uri: string): string {
  return `Saved as ${fileNameOf(uri)}`;
}
