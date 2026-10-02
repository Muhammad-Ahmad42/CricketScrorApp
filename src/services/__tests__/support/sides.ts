import type { MatchSquadEntry, Player, PlayerId, Team } from '@/domain/types';
import type { AppServices } from '../../contracts';
import { expectOk } from './app';

export const LION_NAMES = ['Babar', 'Fakhar', 'Saim', 'Rizwan-L', 'Iftikhar', 'Sarfraz', 'Amir', 'Wasim', 'Waqar', 'Imran', 'Abdul', 'Usman'];
export const TIGER_NAMES = ['Rizwan', 'Shan', 'Saud', 'Agha', 'Azam', 'Faheem', 'Hassan', 'Shaheen', 'Naseem', 'Shadab', 'Haris', 'Ali'];

export interface Side {
  readonly team: Team;
  readonly players: readonly Player[];
  p(number: number): PlayerId;
}

export async function createSide(app: AppServices, name: string, shortName: string, names: readonly string[]): Promise<Side> {
  const team = expectOk(await app.teams.create({ name, shortName, players: names.map((player, index) => ({ name: player, jerseyNumber: index + 1 })) }));
  const detail = expectOk(await app.teams.get(team.id));
  const byName = new Map(detail.players.map((player) => [player.name, player]));
  const players = names.map((player) => {
    const found = byName.get(player);
    if (found === undefined) {
      throw new Error(`Player ${player} missing`);
    }
    return found;
  });
  return {
    team,
    players,
    p(number) {
      return players[number - 1].id;
    },
  };
}

export function squadOf(side: Side, opts: { readonly substitutes?: readonly number[]; readonly keeper?: number } = {}): MatchSquadEntry[] {
  const substitutes = new Set(opts.substitutes ?? []);
  let order = 0;
  return side.players.map((player, index) => {
    const isSubstitute = substitutes.has(index + 1);
    if (!isSubstitute) {
      order += 1;
    }
    return {
      playerId: player.id,
      battingOrder: isSubstitute ? null : order,
      isCaptain: index === 0,
      isWicketKeeper: opts.keeper === index + 1,
      isSubstitute,
    };
  });
}

export function sixNames(prefix: string): readonly string[] {
  return Array.from({ length: 6 }, (_, index) => `${prefix} ${index + 1}`);
}
