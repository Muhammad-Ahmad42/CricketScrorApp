export type Id = string;

export type TeamId = Id;
export type PlayerId = Id;
export type VenueId = Id;
export type MatchId = Id;
export type EventId = Id;
export type ActionId = Id;
export type TournamentId = Id;
export type StageId = Id;
export type PoolId = Id;
export type SlotId = Id;
export type FixtureId = Id;
export type OverrideId = Id;

export type IsoDateTime = string;
export type IsoDate = string;
export type LocalTime = string;

export type BallCount = number;
export type Runs = number;
export type Seq = number;
export type Seed = number;

export type IdGenerator = () => Id;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
