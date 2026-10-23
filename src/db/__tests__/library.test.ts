/** @jest-environment node */
import { createRepositories } from '../repositories';
import { T0, buildMatch, buildTeamSeed, buildVenue, isoAt, squadsFor } from '../testing/builders';
import { openTestRepositories } from '../testing/harness';
import { seedLibrary } from '../testing/tournamentScenario';

describe('TeamRepository', () => {
  it('round-trips teams deep-equal, including nullable and archived fields', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO');
    const archived = { ...buildTeamSeed('old', 'Old Boys', 'OB').team, logoUri: 'file:///logo.png', captainId: null, archivedAt: isoAt(5) };
    await seedLibrary(db, [lions]);
    await repos.teams.insert(archived);
    expect(await repos.teams.get('lio')).toEqual(lions.team);
    expect(await repos.teams.get('old')).toEqual(archived);
    expect(await repos.teams.get('missing')).toBeNull();
  });

  it('accepts a captain inserted after the team inside one transaction (deferred FK)', async () => {
    const { db } = await openTestRepositories();
    const seed = buildTeamSeed('lio', 'Lions', 'LIO', 3);
    await db.withTransactionAsync(async (tx) => {
      const repos = createRepositories(tx);
      await repos.teams.insert(seed.team);
      for (const player of seed.players) {
        await repos.players.insert(player);
      }
    });
    await expect(
      db.withTransactionAsync(async (tx) => {
        await createRepositories(tx).teams.insert({ ...buildTeamSeed('bad', 'Bad', 'BAD', 0).team, captainId: 'nobody' });
      }),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(await createRepositories(db).teams.get('bad')).toBeNull();
  });

  it('lists teams alphabetically, hides archived ones and searches name or short name', async () => {
    const { repos } = await openTestRepositories();
    const teams = [
      buildTeamSeed('t1', 'tigers', 'TIG').team,
      buildTeamSeed('t2', 'Lions', 'LIO').team,
      { ...buildTeamSeed('t3', 'Archived XI', 'AXI').team, archivedAt: T0 },
      buildTeamSeed('t4', '100% Club_', 'PCT').team,
    ].map((team) => ({ ...team, captainId: null }));
    for (const team of teams) {
      await repos.teams.insert(team);
    }
    expect((await repos.teams.list()).map((t) => t.name)).toEqual(['100% Club_', 'Lions', 'tigers']);
    expect((await repos.teams.list({ includeArchived: true })).map((t) => t.id)).toEqual(['t4', 't3', 't2', 't1']);
    expect((await repos.teams.list({ search: 'LIO' })).map((t) => t.id)).toEqual(['t2']);
    expect((await repos.teams.list({ search: 'tig' })).map((t) => t.id)).toEqual(['t1']);
    expect((await repos.teams.list({ search: '%' })).map((t) => t.id)).toEqual(['t4']);
    expect((await repos.teams.list({ search: '_' })).map((t) => t.id)).toEqual(['t4']);
    expect((await repos.teams.list({ search: 'xi' })).map((t) => t.id)).toEqual([]);
    expect((await repos.teams.list({ search: 'xi', includeArchived: true })).map((t) => t.id)).toEqual(['t3']);
  });

  it('searches team names case-insensitively beyond ASCII (NFR-S-17)', async () => {
    const { repos } = await openTestRepositories();
    const teams = [
      buildTeamSeed('elan', 'Élan XI', 'ÉLN').team,
      buildTeamSeed('spa', 'Σπάρτη', 'ΣΠΑ').team,
      buildTeamSeed('ode', 'Одесса', 'ОДС').team,
      buildTeamSeed('lhr', 'لاہور قلندرز', 'LQ').team,
      buildTeamSeed('ela', 'Elan Vale', 'ELV').team,
    ].map((team) => ({ ...team, captainId: null }));
    for (const team of teams) {
      await repos.teams.insert(team);
    }
    const ids = async (search: string): Promise<string[]> => (await repos.teams.list({ search })).map((t) => t.id);
    expect(await ids('élan')).toEqual(['elan']);
    expect(await ids('ÉLAN')).toEqual(['elan']);
    expect(await ids('éln')).toEqual(['elan']);
    expect(await ids('elan')).toEqual(['ela']);
    expect(await ids('ΣΠΆΡΤΗ')).toEqual(['spa']);
    expect(await ids('σπα')).toEqual(['spa']);
    expect(await ids('одесса')).toEqual(['ode']);
    expect(await ids('قلندر')).toEqual(['lhr']);
    expect(await ids('  ')).toHaveLength(5);
  });

  it('updates in place without touching created_at, and a rename shows everywhere', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO');
    const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
    await seedLibrary(db, [lions, tigers]);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig' }), squadsFor(lions, tigers));
    await repos.teams.update({ ...lions.team, name: 'Lahore Lions', createdAt: 'ignored', updatedAt: isoAt(99) });
    expect(await repos.teams.get('lio')).toEqual({ ...lions.team, name: 'Lahore Lions', updatedAt: isoAt(99) });
    const setup = await repos.matches.getSetup('m1');
    expect(setup?.teams[0].name).toBe('Lahore Lions');
    await expect(repos.teams.update({ ...lions.team, shortName: 'TOOLONG' })).rejects.toThrow(/CHECK/);
  });

  it('refuses to delete a team used by a match and deletes an unused one with its players', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO');
    const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
    const spare = buildTeamSeed('spare', 'Spare', 'SPR', 2);
    await seedLibrary(db, [lions, tigers, spare]);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig' }), []);
    await expect(repos.teams.delete('lio')).rejects.toThrow(/FOREIGN KEY/);
    await repos.teams.delete('spare');
    expect(await repos.teams.get('spare')).toBeNull();
    expect(await repos.players.listByTeam('spare', { includeArchived: true })).toEqual([]);
  });
});

describe('PlayerRepository', () => {
  it('round-trips players and lists them in insertion order, hiding archived players', async () => {
    const { db, repos } = await openTestRepositories();
    const seed = buildTeamSeed('lio', 'Lions', 'LIO', 4);
    await seedLibrary(db, [seed]);
    const archived = { ...seed.players[3], archivedAt: isoAt(3), jerseyNumber: null, role: 'unknown' as const };
    await repos.players.update(archived);
    expect(await repos.players.listByTeam('lio')).toEqual(seed.players.slice(0, 3));
    expect(await repos.players.listByTeam('lio', { includeArchived: true })).toEqual([...seed.players.slice(0, 3), archived]);
  });

  it('counts active players per team for the team lists, leaving out archived players and empty teams', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO', 4);
    const tigers = buildTeamSeed('tig', 'Tigers', 'TIG', 2);
    const empty = buildTeamSeed('emp', 'Empty', 'EMP', 0);
    await seedLibrary(db, [lions, tigers, empty]);
    await repos.players.update({ ...lions.players[3], archivedAt: isoAt(3) });
    expect(await repos.players.countActiveByTeam()).toEqual({ lio: 3, tig: 2 });
  });

  it('getMany returns players in the requested order and skips unknown ids', async () => {
    const { db, repos } = await openTestRepositories();
    const seed = buildTeamSeed('lio', 'Lions', 'LIO', 3);
    await seedLibrary(db, [seed]);
    const [p1, p2, p3] = seed.players;
    expect(await repos.players.getMany([p3.id, 'nope', p1.id])).toEqual([p3, p1]);
    expect(await repos.players.getMany([])).toEqual([]);
    expect((await repos.players.getMany([p2.id, p2.id])).map((p) => p.id)).toEqual([p2.id, p2.id]);
  });

  it('refuses to delete a player who played; archiving keeps history', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO');
    const tigers = buildTeamSeed('tig', 'Tigers', 'TIG');
    await seedLibrary(db, [lions, tigers]);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig' }), squadsFor(lions, tigers));
    await expect(repos.players.delete(lions.players[4].id)).rejects.toThrow(/FOREIGN KEY/);
    await repos.players.update({ ...lions.players[4], archivedAt: isoAt(10) });
    const setup = await repos.matches.getSetup('m1');
    expect(setup?.players.some((p) => p.playerId === lions.players[4].id)).toBe(true);
    await expect(repos.players.update({ ...lions.players[1], role: 'captain' as never })).rejects.toThrow(/CHECK/);
  });

  it('clears the captain when the captain player is deleted', async () => {
    const { db, repos } = await openTestRepositories();
    const seed = buildTeamSeed('lio', 'Lions', 'LIO', 2);
    await seedLibrary(db, [seed]);
    await repos.players.delete(seed.players[0].id);
    expect((await repos.teams.get('lio'))?.captainId).toBeNull();
  });
});

describe('VenueRepository', () => {
  it('round-trips, lists, archives and deletes venues', async () => {
    const { repos } = await openTestRepositories();
    const gaddafi = buildVenue('v1', 'Gaddafi Stadium');
    const national = { ...buildVenue('v2', 'national stadium'), location: null, notes: 'Floodlights' };
    await repos.venues.insert(gaddafi);
    await repos.venues.insert(national);
    expect(await repos.venues.get('v2')).toEqual(national);
    expect((await repos.venues.list()).map((v) => v.id)).toEqual(['v1', 'v2']);
    await repos.venues.update({ ...gaddafi, name: 'Gaddafi', updatedAt: isoAt(4) });
    expect((await repos.venues.get('v1'))?.name).toBe('Gaddafi');
    await repos.venues.archive('v1', isoAt(5));
    expect(await repos.venues.get('v1')).toEqual({ ...gaddafi, name: 'Gaddafi', archivedAt: isoAt(5), updatedAt: isoAt(5) });
    expect((await repos.venues.list()).map((v) => v.id)).toEqual(['v2']);
    expect((await repos.venues.list({ includeArchived: true })).map((v) => v.id)).toEqual(['v1', 'v2']);
    await repos.venues.delete('v2');
    expect(await repos.venues.get('v2')).toBeNull();
  });

  it('refuses to delete a venue in use by a match (RESTRICT)', async () => {
    const { db, repos } = await openTestRepositories();
    const lions = buildTeamSeed('lio', 'Lions', 'LIO', 2);
    const tigers = buildTeamSeed('tig', 'Tigers', 'TIG', 2);
    await seedLibrary(db, [lions, tigers], [buildVenue('v1', 'Gaddafi Stadium')]);
    await repos.matches.insert(buildMatch({ id: 'm1', teamAId: 'lio', teamBId: 'tig', venueId: 'v1' }), []);
    await expect(repos.venues.delete('v1')).rejects.toThrow(/FOREIGN KEY/);
    await repos.venues.archive('v1', isoAt(1));
    expect((await repos.venues.get('v1'))?.archivedAt).toBe(isoAt(1));
  });
});
