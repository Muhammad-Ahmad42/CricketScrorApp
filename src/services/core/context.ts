import type { IdGenerator, Seed, TournamentId, TournamentSnapshot } from '@/domain/types';
import type { SqlDatabase } from '@/db';
import type { Clock, FileSystemAdapter, PrintAdapter, ServiceDeps, ShareAdapter } from '../contracts';
import { sha256Hex } from './sha256';

export interface ServiceOptions {
  readonly sha256?: (text: string) => Promise<string>;
  readonly appVersion?: string;
  readonly platform?: string | null;
}

export interface TournamentLocator {
  remember(snapshot: TournamentSnapshot): void;
  forget(tournamentId: TournamentId): void;
  ownerOfStage(stageId: string): TournamentId | null;
  ownerOfFixture(fixtureId: string): TournamentId | null;
}

export interface ServiceContext {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly seeds: () => Seed;
  readonly fileSystem: FileSystemAdapter;
  readonly printer: PrintAdapter;
  readonly sharer: ShareAdapter;
  readonly sha256: (text: string) => Promise<string>;
  readonly app: { readonly version: string; readonly platform: string | null };
  readonly locator: TournamentLocator;
  database(): Promise<SqlDatabase>;
}

export function createTournamentLocator(): TournamentLocator {
  const stages = new Map<string, TournamentId>();
  const fixtures = new Map<string, TournamentId>();
  const forgetOwner = (map: Map<string, TournamentId>, tournamentId: TournamentId) => {
    for (const [key, owner] of [...map.entries()]) {
      if (owner === tournamentId) {
        map.delete(key);
      }
    }
  };
  return {
    remember(snapshot) {
      const id = snapshot.tournament.id;
      forgetOwner(stages, id);
      forgetOwner(fixtures, id);
      snapshot.stages.forEach((stage) => stages.set(stage.id, id));
      snapshot.fixtures.forEach((fixture) => fixtures.set(fixture.id, id));
    },
    forget(tournamentId) {
      forgetOwner(stages, tournamentId);
      forgetOwner(fixtures, tournamentId);
    },
    ownerOfStage(stageId) {
      return stages.get(stageId) ?? null;
    },
    ownerOfFixture(fixtureId) {
      return fixtures.get(fixtureId) ?? null;
    },
  };
}

export function createServiceContext(deps: ServiceDeps, options: ServiceOptions = {}): ServiceContext {
  let opening: Promise<SqlDatabase> | null = null;
  return {
    clock: deps.clock,
    ids: deps.newId,
    seeds: deps.newSeed,
    fileSystem: deps.fileSystem,
    printer: deps.printer,
    sharer: deps.sharer,
    sha256: options.sha256 ?? ((text) => Promise.resolve(sha256Hex(text))),
    app: { version: options.appVersion ?? '1.0.0', platform: options.platform ?? null },
    locator: createTournamentLocator(),
    database() {
      if (opening === null) {
        opening = deps.openDatabase().catch((error: unknown) => {
          opening = null;
          throw error;
        });
      }
      return opening;
    },
  };
}
