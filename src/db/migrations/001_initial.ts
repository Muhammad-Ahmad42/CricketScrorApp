import type { Migration } from '../types';

export const migration001Initial: Migration = {
  version: 1,
  name: 'initial',
  up: `
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at  TEXT NOT NULL
) STRICT;

CREATE TABLE venues (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  location     TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived_at  TEXT
) STRICT;

CREATE TABLE teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  short_name   TEXT NOT NULL CHECK (length(short_name) BETWEEN 1 AND 5),
  logo_uri     TEXT,
  captain_id   TEXT REFERENCES players(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived_at  TEXT
) STRICT;
CREATE INDEX idx_teams_name ON teams(name COLLATE NOCASE);

CREATE TABLE players (
  id             TEXT PRIMARY KEY,
  team_id        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  jersey_number  INTEGER CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 999),
  role           TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (role IN ('batter', 'bowler', 'all_rounder', 'wicket_keeper', 'unknown')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  archived_at    TEXT
) STRICT;
CREATE INDEX idx_players_team ON players(team_id);

CREATE TABLE tournaments (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  season          TEXT,
  description     TEXT,
  logo_uri        TEXT,
  organizer       TEXT,
  contact         TEXT,
  location        TEXT,
  notes           TEXT,
  start_date      TEXT CHECK (start_date IS NULL OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date        TEXT CHECK (end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  structure_kind  TEXT NOT NULL CHECK (structure_kind IN ('league', 'groups', 'knockout', 'groups_knockout', 'custom')),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'registration', 'structure_configured', 'pools_configured',
                                    'fixtures_generated', 'active', 'completed', 'archived')),
  revision        INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  champion_json   TEXT CHECK (champion_json IS NULL OR (json_valid(champion_json) AND json_type(champion_json) = 'array')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
) STRICT;
CREATE INDEX idx_tournaments_status ON tournaments(status, updated_at);

CREATE TABLE tournament_venues (
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  venue_id       TEXT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  order_index    INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  PRIMARY KEY (tournament_id, venue_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE tournament_rules (
  tournament_id             TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  points_win                INTEGER NOT NULL,
  points_tie                INTEGER NOT NULL,
  points_no_result          INTEGER NOT NULL,
  points_loss               INTEGER NOT NULL,
  points_abandoned          INTEGER,
  points_walkover_win       INTEGER,
  points_walkover_loss      INTEGER,
  super_over_decided_tie    TEXT NOT NULL DEFAULT 'win_loss' CHECK (super_over_decided_tie IN ('win_loss', 'tie')),
  bonus_json                TEXT CHECK (bonus_json IS NULL OR json_valid(bonus_json)),
  nrr_mode                  TEXT NOT NULL DEFAULT 'icc' CHECK (nrr_mode IN ('icc', 'actual_overs')),
  nrr_options_json          TEXT NOT NULL CHECK (json_valid(nrr_options_json)),
  tie_breakers_json         TEXT NOT NULL CHECK (json_valid(tie_breakers_json) AND json_type(tie_breakers_json) = 'array'),
  default_format_id         TEXT NOT NULL,
  default_match_rules_json  TEXT NOT NULL CHECK (json_valid(default_match_rules_json)),
  updated_at                TEXT NOT NULL
) STRICT;

CREATE TABLE tournament_teams (
  id                     TEXT PRIMARY KEY,
  tournament_id          TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id                TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  seed                   INTEGER CHECK (seed IS NULL OR seed >= 1),
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'replaced')),
  replaced_by_team_id    TEXT,
  inherits_from_team_id  TEXT,
  joined_at              TEXT NOT NULL,
  UNIQUE (tournament_id, team_id),
  FOREIGN KEY (tournament_id, replaced_by_team_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tournament_id, inherits_from_team_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status = 'replaced') = (replaced_by_team_id IS NOT NULL)),
  CHECK (replaced_by_team_id IS NULL OR replaced_by_team_id <> team_id),
  CHECK (inherits_from_team_id IS NULL OR inherits_from_team_id <> team_id)
) STRICT;
CREATE INDEX idx_tournament_teams_team ON tournament_teams(team_id);

CREATE TABLE tournament_stages (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type           TEXT NOT NULL CHECK (type IN ('league', 'group', 'knockout', 'custom')),
  order_index    INTEGER NOT NULL CHECK (order_index >= 0),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
  config_json    TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (tournament_id, order_index),
  UNIQUE (id, tournament_id)
) STRICT;

CREATE TABLE pools (
  id           TEXT PRIMARY KEY,
  stage_id     TEXT NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  order_index  INTEGER NOT NULL CHECK (order_index >= 0),
  legs         INTEGER CHECK (legs IS NULL OR legs >= 1),
  UNIQUE (stage_id, order_index),
  UNIQUE (stage_id, name),
  UNIQUE (id, stage_id)
) STRICT;

CREATE TABLE stage_slots (
  id                 TEXT PRIMARY KEY,
  stage_id           TEXT NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  slot_index         INTEGER NOT NULL CHECK (slot_index >= 0),
  role               TEXT NOT NULL CHECK (role IN ('entry', 'progression')),
  label              TEXT NOT NULL CHECK (length(trim(label)) > 0),
  seed               INTEGER CHECK (seed IS NULL OR seed >= 1),
  source_kind        TEXT NOT NULL CHECK (source_kind IN ('pool_position', 'best_of_position', 'overall_position',
                                                          'bracket_winner', 'bracket_loser',
                                                          'fixture_winner', 'fixture_loser', 'manual')),
  source_json        TEXT NOT NULL CHECK (json_valid(source_json) AND json_extract(source_json, '$.kind') = source_kind),
  source_stage_id    TEXT GENERATED ALWAYS AS (json_extract(source_json, '$.stageId')) VIRTUAL
                     REFERENCES tournament_stages(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  source_pool_id     TEXT GENERATED ALWAYS AS (json_extract(source_json, '$.poolId')) VIRTUAL
                     REFERENCES pools(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  source_fixture_id  TEXT GENERATED ALWAYS AS (json_extract(source_json, '$.fixtureId')) VIRTUAL
                     REFERENCES fixtures(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  source_team_id     TEXT GENERATED ALWAYS AS (json_extract(source_json, '$.teamId')) VIRTUAL
                     REFERENCES teams(id) ON DELETE RESTRICT,
  UNIQUE (stage_id, slot_index),
  UNIQUE (id, stage_id),
  CHECK (role = 'entry' OR source_kind IN ('bracket_winner', 'bracket_loser', 'fixture_winner', 'fixture_loser')),
  CHECK (role = 'entry' OR seed IS NULL),
  CHECK (role = 'entry' OR source_kind NOT IN ('bracket_winner', 'bracket_loser') OR source_stage_id = stage_id)
) STRICT;
CREATE INDEX idx_stage_slots_source_fixture ON stage_slots(source_fixture_id);
CREATE INDEX idx_stage_slots_source_pool ON stage_slots(source_pool_id);

CREATE TABLE pool_teams (
  id             TEXT PRIMARY KEY,
  pool_id        TEXT NOT NULL,
  stage_id       TEXT NOT NULL,
  tournament_id  TEXT NOT NULL,
  team_id        TEXT,
  slot_id        TEXT,
  seed           INTEGER CHECK (seed IS NULL OR seed >= 1),
  order_index    INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  FOREIGN KEY (pool_id, stage_id) REFERENCES pools(id, stage_id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id, tournament_id) REFERENCES tournament_stages(id, tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (tournament_id, team_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (slot_id, stage_id) REFERENCES stage_slots(id, stage_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK ((team_id IS NULL) <> (slot_id IS NULL)),
  UNIQUE (stage_id, team_id),
  UNIQUE (stage_id, slot_id)
) STRICT;
CREATE INDEX idx_pool_teams_pool ON pool_teams(pool_id, order_index);
CREATE INDEX idx_pool_teams_tournament_team ON pool_teams(tournament_id, team_id);

CREATE TABLE fixtures (
  id                  TEXT PRIMARY KEY,
  tournament_id       TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_id            TEXT NOT NULL,
  pool_id             TEXT,
  match_number        INTEGER NOT NULL CHECK (match_number >= 1),
  label               TEXT,
  round               INTEGER CHECK (round IS NULL OR round >= 1),
  leg                 INTEGER CHECK (leg IS NULL OR leg >= 1),
  bracket_kind        TEXT CHECK (bracket_kind IS NULL OR bracket_kind IN ('main', 'third_place', 'placement')),
  bracket_round       INTEGER CHECK (bracket_round IS NULL OR bracket_round >= 1),
  bracket_position    INTEGER CHECK (bracket_position IS NULL OR bracket_position >= 0),
  bracket_round_name  TEXT,
  is_final            INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  side_a_team_id      TEXT,
  side_a_slot_id      TEXT,
  side_b_team_id      TEXT,
  side_b_slot_id      TEXT,
  scheduled_date      TEXT CHECK (scheduled_date IS NULL OR scheduled_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  scheduled_time      TEXT CHECK (scheduled_time IS NULL OR scheduled_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  venue_id            TEXT REFERENCES venues(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'postponed', 'rescheduled', 'live', 'completed', 'abandoned', 'cancelled')),
  match_id            TEXT UNIQUE,
  format_id           TEXT,
  match_rules_json    TEXT CHECK (match_rules_json IS NULL OR json_valid(match_rules_json)),
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (stage_id, tournament_id) REFERENCES tournament_stages(id, tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (pool_id, stage_id) REFERENCES pools(id, stage_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tournament_id, side_a_team_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tournament_id, side_b_team_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (side_a_slot_id, stage_id) REFERENCES stage_slots(id, stage_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (side_b_slot_id, stage_id) REFERENCES stage_slots(id, stage_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (match_id, id) REFERENCES matches(id, fixture_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (id, tournament_id),
  CHECK ((side_a_team_id IS NULL) <> (side_a_slot_id IS NULL)),
  CHECK ((side_b_team_id IS NULL) <> (side_b_slot_id IS NULL)),
  CHECK (side_a_team_id IS NULL OR side_b_team_id IS NULL OR side_a_team_id <> side_b_team_id),
  CHECK (side_a_slot_id IS NULL OR side_b_slot_id IS NULL OR side_a_slot_id <> side_b_slot_id),
  CHECK ((bracket_round IS NULL) = (bracket_position IS NULL)),
  CHECK ((bracket_round IS NULL) = (bracket_kind IS NULL)),
  CHECK (status NOT IN ('live', 'completed', 'abandoned') OR match_id IS NOT NULL)
) STRICT;
CREATE INDEX idx_fixtures_stage_pool ON fixtures(stage_id, pool_id);
CREATE UNIQUE INDEX idx_fixtures_bracket ON fixtures(stage_id, bracket_kind, bracket_round, bracket_position)
  WHERE bracket_round IS NOT NULL;
CREATE UNIQUE INDEX idx_fixtures_final ON fixtures(stage_id) WHERE is_final = 1;
CREATE INDEX idx_fixtures_side_a_team ON fixtures(tournament_id, side_a_team_id);
CREATE INDEX idx_fixtures_side_b_team ON fixtures(tournament_id, side_b_team_id);
CREATE INDEX idx_fixtures_schedule ON fixtures(tournament_id, scheduled_date, scheduled_time);
CREATE INDEX idx_fixtures_status ON fixtures(tournament_id, status);
CREATE INDEX idx_fixtures_match_number ON fixtures(tournament_id, match_number);

CREATE TABLE matches (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  tournament_id        TEXT REFERENCES tournaments(id) ON DELETE RESTRICT,
  fixture_id           TEXT,
  team_a_id            TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  team_b_id            TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  team_a_players       INTEGER CHECK (team_a_players IS NULL OR team_a_players BETWEEN 2 AND 15),
  team_b_players       INTEGER CHECK (team_b_players IS NULL OR team_b_players BETWEEN 2 AND 15),
  venue_id             TEXT REFERENCES venues(id) ON DELETE RESTRICT,
  scheduled_date       TEXT CHECK (scheduled_date IS NULL OR scheduled_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  scheduled_time       TEXT CHECK (scheduled_time IS NULL OR scheduled_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  format_id            TEXT NOT NULL,
  rules_json           TEXT NOT NULL CHECK (json_valid(rules_json)),
  overs_per_innings    INTEGER GENERATED ALWAYS AS (json_extract(rules_json, '$.oversPerInnings')) VIRTUAL
                       CHECK (overs_per_innings >= 1),
  toss_winner_team_id  TEXT REFERENCES teams(id) ON DELETE RESTRICT,
  toss_decision        TEXT CHECK (toss_decision IS NULL OR toss_decision IN ('bat', 'bowl')),
  status               TEXT NOT NULL DEFAULT 'scheduled'
                       CHECK (status IN ('scheduled', 'live', 'paused', 'completed', 'postponed', 'cancelled', 'abandoned')),
  result_json          TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  result_type          TEXT GENERATED ALWAYS AS (json_extract(result_json, '$.type')) VIRTUAL,
  winner_team_id       TEXT REFERENCES teams(id) ON DELETE RESTRICT,
  summary_json         TEXT CHECK (summary_json IS NULL OR json_valid(summary_json)),
  projection_version   INTEGER NOT NULL DEFAULT 0 CHECK (projection_version >= 0),
  resume_dismissed_at  TEXT,
  started_at           TEXT,
  completed_at         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  FOREIGN KEY (fixture_id, tournament_id) REFERENCES fixtures(id, tournament_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tournament_id, team_a_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tournament_id, team_b_id) REFERENCES tournament_teams(tournament_id, team_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK (team_a_id <> team_b_id),
  CHECK ((toss_winner_team_id IS NULL) = (toss_decision IS NULL)),
  CHECK (toss_winner_team_id IS NULL OR toss_winner_team_id IN (team_a_id, team_b_id)),
  CHECK (winner_team_id IS NULL OR winner_team_id IN (team_a_id, team_b_id)),
  CHECK ((status IN ('completed', 'abandoned')) = (result_json IS NOT NULL)),
  CHECK ((status = 'abandoned') = (result_type IS 'abandoned')),
  CHECK (summary_json IS NULL OR result_json IS NOT NULL),
  CHECK (fixture_id IS NULL OR tournament_id IS NOT NULL),
  UNIQUE (id, fixture_id)
) STRICT;
CREATE INDEX idx_matches_status ON matches(status, updated_at);
CREATE INDEX idx_matches_tournament ON matches(tournament_id, status);
CREATE INDEX idx_matches_fixture ON matches(fixture_id);
CREATE INDEX idx_matches_team_a ON matches(team_a_id);
CREATE INDEX idx_matches_team_b ON matches(team_b_id);
CREATE INDEX idx_matches_created ON matches(created_at);
CREATE INDEX idx_matches_projection_version ON matches(projection_version);

CREATE TABLE match_players (
  match_id          TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  team_id           TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  batting_order     INTEGER CHECK (batting_order IS NULL OR batting_order >= 1),
  is_captain        INTEGER NOT NULL DEFAULT 0 CHECK (is_captain IN (0, 1)),
  is_wicket_keeper  INTEGER NOT NULL DEFAULT 0 CHECK (is_wicket_keeper IN (0, 1)),
  is_substitute     INTEGER NOT NULL DEFAULT 0 CHECK (is_substitute IN (0, 1)),
  PRIMARY KEY (match_id, player_id),
  CHECK (is_substitute = 0 OR (batting_order IS NULL AND is_captain = 0))
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_match_players_team ON match_players(match_id, team_id, batting_order);
CREATE INDEX idx_match_players_player ON match_players(player_id);
CREATE TRIGGER trg_match_players_team_insert BEFORE INSERT ON match_players
  WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = NEW.match_id AND NEW.team_id IN (m.team_a_id, m.team_b_id))
  BEGIN SELECT RAISE(ABORT, 'match_players.team_id is not a team of this match'); END;
CREATE TRIGGER trg_match_players_team_update BEFORE UPDATE OF match_id, team_id ON match_players
  WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = NEW.match_id AND NEW.team_id IN (m.team_a_id, m.team_b_id))
  BEGIN SELECT RAISE(ABORT, 'match_players.team_id is not a team of this match'); END;

CREATE TABLE match_events (
  id                   TEXT PRIMARY KEY,
  match_id             TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq                  INTEGER NOT NULL CHECK (seq >= 1),
  action_id            TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('innings_started', 'delivery', 'batter_in', 'bowler_selected',
                         'strike_swapped', 'batter_retired', 'batter_dismissed', 'penalty_awarded', 'overs_revised',
                         'play_suspended', 'play_resumed', 'innings_ended', 'super_over_started', 'match_ended')),
  recorded_at          TEXT NOT NULL,
  striker_id           TEXT,
  non_striker_id       TEXT,
  bowler_id            TEXT,
  call                 TEXT CHECK (call IS NULL OR call IN ('fair', 'wide', 'no_ball')),
  runs_to              TEXT CHECK (runs_to IS NULL OR runs_to IN ('bat', 'bye', 'leg_bye')),
  runs_run             INTEGER CHECK (runs_run IS NULL OR runs_run BETWEEN 0 AND 9),
  short_runs           INTEGER CHECK (short_runs IS NULL OR short_runs BETWEEN 0 AND 9),
  boundary             INTEGER CHECK (boundary IS NULL OR boundary IN (0, 4, 6)),
  wicket_type          TEXT CHECK (wicket_type IS NULL OR wicket_type IN ('bowled', 'caught', 'lbw', 'run_out',
                         'stumped', 'hit_wicket', 'hit_ball_twice', 'obstructing_field', 'handled_ball')),
  dismissed_player_id  TEXT,
  fielder_id           TEXT,
  fielder2_id          TEXT,
  dismissal_end        TEXT CHECK (dismissal_end IS NULL OR dismissal_end IN ('striker_end', 'non_striker_end')),
  payload_json         TEXT CHECK (payload_json IS NULL OR (json_valid(payload_json) AND json_type(payload_json) = 'object')),
  p_player_id          TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.playerId')) VIRTUAL,
  p_striker_id         TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.strikerId')) VIRTUAL,
  p_non_striker_id     TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.nonStrikerId')) VIRTUAL,
  p_bowler_id          TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.bowlerId')) VIRTUAL,
  p_fielder1_id        TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.fielderIds[0]')) VIRTUAL,
  p_fielder2_id        TEXT GENERATED ALWAYS AS (json_extract(payload_json, '$.fielderIds[1]')) VIRTUAL,
  p_team_id            TEXT GENERATED ALWAYS AS (coalesce(json_extract(payload_json, '$.battingTeamId'),
                         json_extract(payload_json, '$.teamId'), json_extract(payload_json, '$.outcome.winnerTeamId'))) VIRTUAL
                       REFERENCES teams(id) ON DELETE RESTRICT,
  UNIQUE (match_id, seq),
  FOREIGN KEY (match_id, striker_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, non_striker_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, bowler_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, dismissed_player_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, fielder_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, fielder2_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_player_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_striker_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_non_striker_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_bowler_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_fielder1_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  FOREIGN KEY (match_id, p_fielder2_id) REFERENCES match_players(match_id, player_id) ON DELETE NO ACTION,
  CHECK ((kind = 'delivery') = (call IS NOT NULL)),
  CHECK ((kind = 'delivery') = (payload_json IS NULL)),
  CHECK (kind <> 'delivery' OR (striker_id IS NOT NULL AND bowler_id IS NOT NULL
                                AND runs_run IS NOT NULL AND short_runs IS NOT NULL AND boundary IS NOT NULL)),
  CHECK (kind = 'delivery' OR (striker_id IS NULL AND non_striker_id IS NULL AND bowler_id IS NULL
                               AND runs_to IS NULL AND runs_run IS NULL AND short_runs IS NULL AND boundary IS NULL
                               AND wicket_type IS NULL AND dismissed_player_id IS NULL AND fielder_id IS NULL
                               AND fielder2_id IS NULL AND dismissal_end IS NULL)),
  CHECK (short_runs IS NULL OR short_runs <= runs_run),
  CHECK (call IS NULL OR ((call = 'wide') = (runs_to IS NULL))),
  CHECK (boundary IS NOT 6 OR runs_to IS 'bat'),
  CHECK ((wicket_type IS NULL) = (dismissed_player_id IS NULL)),
  CHECK (fielder2_id IS NULL OR fielder_id IS NOT NULL),
  CHECK (dismissal_end IS NULL OR wicket_type IN ('run_out', 'obstructing_field', 'handled_ball')),
  CHECK (striker_id IS NULL OR non_striker_id IS NULL OR striker_id <> non_striker_id)
) STRICT;
CREATE INDEX idx_match_events_action ON match_events(match_id, action_id);
CREATE INDEX idx_match_events_payload_player ON match_events(match_id, p_player_id);

CREATE TABLE innings (
  match_id           TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  innings_index      INTEGER NOT NULL CHECK (innings_index >= 0),
  kind               TEXT NOT NULL CHECK (kind IN ('regular', 'super_over')),
  super_over_round   INTEGER CHECK (super_over_round IS NULL OR super_over_round >= 1),
  batting_team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  bowling_team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  runs               INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
  wickets            INTEGER NOT NULL DEFAULT 0 CHECK (wickets >= 0),
  legal_balls        INTEGER NOT NULL DEFAULT 0 CHECK (legal_balls >= 0),
  max_balls          INTEGER NOT NULL CHECK (max_balls >= 1),
  balls_per_over     INTEGER NOT NULL CHECK (balls_per_over BETWEEN 1 AND 12),
  target             INTEGER CHECK (target IS NULL OR target >= 1),
  target_revised     INTEGER NOT NULL DEFAULT 0 CHECK (target_revised IN (0, 1)),
  extras_json        TEXT NOT NULL CHECK (json_valid(extras_json)),
  status             TEXT NOT NULL CHECK (status IN ('in_progress', 'complete')),
  completion_reason  TEXT CHECK (completion_reason IS NULL OR completion_reason IN ('all_out', 'overs_complete',
                       'target_reached', 'declared', 'batters_unavailable', 'match_ended', 'terminated')),
  updated_at         TEXT NOT NULL,
  PRIMARY KEY (match_id, innings_index),
  CHECK (batting_team_id <> bowling_team_id),
  CHECK ((kind = 'super_over') = (super_over_round IS NOT NULL)),
  CHECK ((status = 'complete') = (completion_reason IS NOT NULL))
) STRICT, WITHOUT ROWID;
CREATE TRIGGER trg_innings_teams_insert BEFORE INSERT ON innings
  WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = NEW.match_id
                     AND NEW.batting_team_id IN (m.team_a_id, m.team_b_id)
                     AND NEW.bowling_team_id IN (m.team_a_id, m.team_b_id))
  BEGIN SELECT RAISE(ABORT, 'innings teams are not the teams of this match'); END;
CREATE TRIGGER trg_innings_teams_update BEFORE UPDATE OF match_id, batting_team_id, bowling_team_id ON innings
  WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = NEW.match_id
                     AND NEW.batting_team_id IN (m.team_a_id, m.team_b_id)
                     AND NEW.bowling_team_id IN (m.team_a_id, m.team_b_id))
  BEGIN SELECT RAISE(ABORT, 'innings teams are not the teams of this match'); END;
CREATE TRIGGER trg_matches_teams_update BEFORE UPDATE OF team_a_id, team_b_id ON matches
  WHEN EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = NEW.id
                 AND mp.team_id NOT IN (NEW.team_a_id, NEW.team_b_id))
    OR EXISTS (SELECT 1 FROM innings i WHERE i.match_id = NEW.id
                 AND (i.batting_team_id NOT IN (NEW.team_a_id, NEW.team_b_id)
                      OR i.bowling_team_id NOT IN (NEW.team_a_id, NEW.team_b_id)))
    OR EXISTS (SELECT 1 FROM match_events e WHERE e.match_id = NEW.id
                 AND e.p_team_id IS NOT NULL AND e.p_team_id NOT IN (NEW.team_a_id, NEW.team_b_id))
  BEGIN SELECT RAISE(ABORT, 'a squad, innings or event row names a team that is not a team of this match'); END;

CREATE TABLE partnerships (
  match_id           TEXT NOT NULL,
  innings_index      INTEGER NOT NULL,
  partnership_index  INTEGER NOT NULL CHECK (partnership_index >= 0),
  wicket_number      INTEGER NOT NULL CHECK (wicket_number >= 1),
  batter_a_id        TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  batter_b_id        TEXT REFERENCES players(id) ON DELETE RESTRICT,
  runs               INTEGER NOT NULL CHECK (runs >= 0),
  balls              INTEGER NOT NULL CHECK (balls >= 0),
  batter_a_runs      INTEGER NOT NULL CHECK (batter_a_runs >= 0),
  batter_a_balls     INTEGER NOT NULL CHECK (batter_a_balls >= 0),
  batter_b_runs      INTEGER NOT NULL CHECK (batter_b_runs >= 0),
  batter_b_balls     INTEGER NOT NULL CHECK (batter_b_balls >= 0),
  extras             INTEGER NOT NULL CHECK (extras >= 0),
  ended_by           TEXT CHECK (ended_by IS NULL OR ended_by IN ('wicket', 'retirement', 'innings_end')),
  PRIMARY KEY (match_id, innings_index, partnership_index),
  FOREIGN KEY (match_id, innings_index) REFERENCES innings(match_id, innings_index) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE tournament_overrides (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('qualification', 'points_adjustment', 'tie_resolution',
                                               'slot_assignment', 'expunge_results', 'champion')),
  stage_id       TEXT REFERENCES tournament_stages(id) ON DELETE SET NULL,
  pool_id        TEXT REFERENCES pools(id) ON DELETE SET NULL,
  slot_id        TEXT REFERENCES stage_slots(id) ON DELETE SET NULL,
  team_id        TEXT REFERENCES teams(id) ON DELETE RESTRICT,
  payload_json   TEXT NOT NULL CHECK (json_valid(payload_json) AND json_extract(payload_json, '$.kind') = kind),
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at     TEXT NOT NULL,
  revoked_at     TEXT,
  revoke_reason  TEXT
) STRICT;
CREATE INDEX idx_overrides_tournament ON tournament_overrides(tournament_id, revoked_at);

CREATE TABLE audit_events (
  id             TEXT PRIMARY KEY,
  tournament_id  TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id       TEXT REFERENCES matches(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (length(action) > 0),
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('tournament', 'rules', 'team', 'stage', 'pool', 'slot',
                                                      'fixture', 'match', 'override', 'backup', 'app')),
  entity_id      TEXT NOT NULL,
  summary        TEXT NOT NULL,
  previous_json  TEXT CHECK (previous_json IS NULL OR json_valid(previous_json)),
  new_json       TEXT CHECK (new_json IS NULL OR json_valid(new_json)),
  reason         TEXT,
  impact_json    TEXT CHECK (impact_json IS NULL OR json_valid(impact_json)),
  created_at     TEXT NOT NULL
) STRICT;
CREATE INDEX idx_audit_tournament ON audit_events(tournament_id, created_at);
CREATE INDEX idx_audit_match ON audit_events(match_id, created_at);

CREATE TABLE tournament_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description     TEXT NOT NULL DEFAULT '',
  team_count      INTEGER CHECK (team_count IS NULL OR team_count >= 2),
  structure_json  TEXT NOT NULL CHECK (json_valid(structure_json)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;

CREATE TABLE match_format_presets (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  rules_json   TEXT NOT NULL CHECK (json_valid(rules_json)),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
) STRICT;
`,
};
