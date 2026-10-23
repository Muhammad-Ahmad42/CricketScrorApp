/** @jest-environment node */
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { expectFailure, expectOk, openHarness, rowCount, type Harness } from './support/app';

describe('team, player and venue library (§27)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await openHarness();
  });

  it('creates a team with its players and captain in one transaction', async () => {
    const team = expectOk(
      await harness.app.teams.create({
        name: '  Pakistan XI ',
        shortName: '',
        players: [{ name: 'Babar', jerseyNumber: 56, role: 'batter' }, { name: 'Shaheen' }],
        captainIndex: 0,
      }),
    );
    expect(team).toMatchObject({ name: 'Pakistan XI', shortName: 'PAK' });
    const detail = expectOk(await harness.app.teams.get(team.id));
    expect(detail.players.map((player) => player.name).sort()).toEqual(['Babar', 'Shaheen']);
    expect(team.captainId).toBe(detail.players.find((player) => player.name === 'Babar')?.id);
    expect(detail.players.find((player) => player.name === 'Shaheen')).toMatchObject({ role: 'unknown', jerseyNumber: null });
    expect(await harness.app.teams.playerCounts?.()).toEqual({ ok: true, value: { [team.id]: 2 } });
  });

  it('rejects invalid input without writing anything', async () => {
    const before = await rowCount(harness.db, 'players');
    expectFailure(await harness.app.teams.create({ name: ' ', shortName: 'X', players: [] }), 'VALIDATION');
    expectFailure(await harness.app.teams.create({ name: 'Bad', shortName: 'BAD', players: [{ name: 'A' }, { name: '' }] }), 'VALIDATION');
    expectFailure(await harness.app.teams.create({ name: 'Bad', shortName: 'BAD', players: [{ name: 'A' }], captainIndex: 3 }), 'VALIDATION');
    expectFailure(await harness.app.teams.create({ name: 'Bad', shortName: 'TOOLONGNAME', players: [] }), 'VALIDATION');
    expect(await rowCount(harness.db, 'players')).toBe(before);
    expect(await rowCount(harness.db, 'teams')).toBe(1);
  });

  it('updates and archives teams and players', async () => {
    const [team] = expectOk(await harness.app.teams.list());
    const renamed = expectOk(await harness.app.teams.update({ ...team, name: 'Pakistan', shortName: 'PK' }));
    expect(renamed.name).toBe('Pakistan');
    const player = expectOk(await harness.app.teams.addPlayer(team.id, { name: 'Rizwan', jerseyNumber: 16 }));
    expect(expectOk(await harness.app.teams.updatePlayer({ ...player, name: 'Mohammad Rizwan' })).name).toBe('Mohammad Rizwan');
    expectFailure(await harness.app.teams.updatePlayer({ ...player, jerseyNumber: -1 }), 'VALIDATION');
    expectOk(await harness.app.teams.archivePlayer(player.id));
    expect(expectOk(await harness.app.teams.get(team.id)).players.map((entry) => entry.id)).not.toContain(player.id);
    expectOk(await harness.app.teams.archive(team.id));
    expect(expectOk(await harness.app.teams.list())).toEqual([]);
    expect(expectOk(await harness.app.teams.list({ includeArchived: true }))).toHaveLength(1);
    expectFailure(await harness.app.teams.addPlayer('missing', { name: 'X' }), 'NOT_FOUND');
    expectFailure(await harness.app.teams.archivePlayer('missing'), 'NOT_FOUND');
  });

  it('creates, lists and archives venues', async () => {
    expectFailure(await harness.app.teams.createVenue({ name: '', location: null }), 'VALIDATION');
    const venue = expectOk(await harness.app.teams.createVenue({ name: 'Gaddafi Stadium', location: ' Lahore ' }));
    expect(venue.location).toBe('Lahore');
    expect(expectOk(await harness.app.teams.listVenues()).map((entry) => entry.id)).toEqual([venue.id]);
    expectOk(await harness.app.teams.archiveVenue(venue.id));
    expect(expectOk(await harness.app.teams.listVenues())).toEqual([]);
    expectFailure(await harness.app.teams.archiveVenue('missing'), 'NOT_FOUND');
  });
});

describe('settings (§70, §76, §77)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await openHarness();
  });

  it('loads defaults when nothing is stored', async () => {
    expect(expectOk(await harness.app.settings.load())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.soundEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.hapticsEnabled).toBe(true);
  });

  it('persists only the changed top-level keys and merges scoring preferences', async () => {
    const updated = expectOk(await harness.app.settings.update({ theme: 'dark', hapticsEnabled: true, scoring: { ...DEFAULT_SETTINGS.scoring, dotStyle: 'dot' } }));
    expect(updated).toMatchObject({ theme: 'dark', scoring: { dotStyle: 'dot', keepAwake: true } });
    expect(await rowCount(harness.db, 'app_settings')).toBe(2);
    expect(expectOk(await harness.app.settings.load())).toEqual(updated);
  });

  it('rejects invalid values', async () => {
    expectFailure(await harness.app.settings.update({ theme: 'neon' as never }), 'VALIDATION');
    expectFailure(await harness.app.settings.update({ defaultFormatId: ' ' }), 'VALIDATION');
    expectFailure(await harness.app.settings.update({ reduceTransparency: 'yes' as never }), 'VALIDATION');
    expect(expectOk(await harness.app.settings.load()).theme).toBe('dark');
  });

  it('defaults reduce transparency to off and persists the in-app switch (§106)', async () => {
    expect(DEFAULT_SETTINGS.reduceTransparency).toBe(false);
    expect(expectOk(await harness.app.settings.load()).reduceTransparency).toBe(false);
    const before = await rowCount(harness.db, 'app_settings');
    expect(expectOk(await harness.app.settings.update({ reduceTransparency: true })).reduceTransparency).toBe(true);
    expect(await rowCount(harness.db, 'app_settings')).toBe(before + 1);
    expect(expectOk(await harness.app.settings.load())).toMatchObject({ reduceTransparency: true, theme: 'dark' });
    expectOk(await harness.app.settings.update({ reduceTransparency: false }));
    expect(expectOk(await harness.app.settings.load()).reduceTransparency).toBe(false);
  });
});
