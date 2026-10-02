/** @jest-environment node */
import { createSqlJsDatabase } from '@/db/testing';
import { standaloneWorld } from '@/services/__tests__/support/standalone';
import { createTestApp } from '@/services/testing';
import { useBackupStore, useExportStore, useHomeStore, useMatchHistoryStore, useTeamLibraryStore, useTournamentListStore } from '@/stores';
import { setAppServices } from '@/stores/services';
import { expectValue, storeHarness } from './support/harness';

jest.setTimeout(60000);

describe('useTeamLibraryStore', () => {
  it('creates, edits and archives teams, players and venues and keeps the lists fresh', async () => {
    await storeHarness();
    const store = () => useTeamLibraryStore.getState();
    expect(await store().load()).toBe(true);
    expect(store()).toMatchObject({ status: 'ready', teams: [], venues: [] });
    const team = await store().createTeam({ name: 'Lions', shortName: 'LIO', players: [{ name: 'Babar' }] });
    expect(team?.name).toBe('Lions');
    expect(store().teams.map((entry) => entry.name)).toEqual(['Lions']);
    expect(await store().loadTeam(team?.id ?? '')).toBe(true);
    expect(store().detail?.players.map((player) => player.name)).toEqual(['Babar']);
    const player = await store().addPlayer(team?.id ?? '', { name: 'Fakhar' });
    expect(player?.name).toBe('Fakhar');
    expect(store().detail?.players.map((entry) => entry.name).sort()).toEqual(['Babar', 'Fakhar']);
    expect(await store().updatePlayer({ ...(player ?? store().detail!.players[0]), name: 'Fakhar Zaman' })).toBe(true);
    expect(store().detail?.players.some((entry) => entry.name === 'Fakhar Zaman')).toBe(true);
    expect(await store().archivePlayer(player?.id ?? '')).toBe(true);
    expect(store().detail?.players.map((entry) => entry.name)).toEqual(['Babar']);
    expect(await store().updateTeam({ ...(team ?? store().teams[0]), name: 'Lahore Lions' })).toBe(true);
    expect(store().teams[0].name).toBe('Lahore Lions');
    expect(store().detail?.team.name).toBe('Lahore Lions');
    const venue = await store().createVenue({ name: 'Gaddafi Stadium', location: 'Lahore' });
    expect(store().venues.map((entry) => entry.id)).toEqual([venue?.id]);
    expect(await store().archiveVenue(venue?.id ?? '')).toBe(true);
    expect(store().venues).toEqual([]);
    expect(await store().archiveTeam(team?.id ?? '')).toBe(true);
    expect(store().teams).toEqual([]);
    expect(await store().load({ includeArchived: true })).toBe(true);
    expect(store().teams).toHaveLength(1);
    expect(await store().createTeam({ name: '', shortName: 'X', players: [] })).toBeNull();
    expect(store().error?.code).toBe('VALIDATION');
    store().clearError();
    expect(store().error).toBeNull();
  });
});

describe('useExportStore', () => {
  it('writes PDFs, shares them and reports failures', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    const live = await world.start(harness.app);
    const store = () => useExportStore.getState();
    const uri = await store().scorecardPdf(live.match.id);
    expect(uri).toMatch(/\.pdf$/);
    expect(await store().share(uri ?? '', 'application/pdf')).toBe(true);
    harness.app.deps.sharer.setAvailable(false);
    expect(await store().share(uri ?? '', 'application/pdf')).toBe(false);
    expect(store().error?.code).toBe('EXPORT_FAILED');
    store().clearError();
    expect(await store().tournamentPdf('missing')).toBeNull();
    expect(store().error?.code).toBe('NOT_FOUND');
  });
});

describe('useBackupStore', () => {
  it('exports, previews and imports a backup and reloads the visible lists', async () => {
    const source = await storeHarness();
    const world = await standaloneWorld(source.app);
    await world.start(source.app);
    const store = () => useBackupStore.getState();
    const fileUri = await store().exportBackup({ kind: 'full' });
    expect(fileUri).toBe(store().exportedFileUri);
    const text = source.app.deps.fileSystem.files.get(fileUri ?? '') ?? '';

    const target = createTestApp(await createSqlJsDatabase());
    expectValue(await target.bootstrap());
    setAppServices(target);
    target.deps.fileSystem.put('file:///picked/backup.json', text);
    expect(await useHomeStore.getState().load()).toBe(true);
    expect(await useMatchHistoryStore.getState().load({})).toBe(true);
    expect(useMatchHistoryStore.getState().items).toEqual([]);
    expect(await store().applyImport('file:///picked/backup.json', 'skip_existing')).toBe(false);
    expect(store().error?.code).toBe('IMPORT_INVALID');
    expect(await store().previewImport('file:///picked/backup.json')).toBe(true);
    expect(store().preview?.ok).toBe(true);
    expect(store().importFileUri).toBe('file:///picked/backup.json');
    expect(await store().applyImport('file:///picked/backup.json', 'skip_existing')).toBe(true);
    expect(store().report?.rebuiltMatches).toBe(1);
    expect(useMatchHistoryStore.getState().items).toHaveLength(1);
    expect(useHomeStore.getState().resumable).toHaveLength(1);
    expect(useTournamentListStore.getState().status).toBe('idle');
    target.deps.fileSystem.put('file:///picked/broken.json', '{');
    expect(await store().previewImport('file:///picked/broken.json')).toBe(true);
    expect(store().preview?.ok).toBe(false);
    expect(await store().applyImport('file:///picked/broken.json', 'skip_existing')).toBe(false);
    store().reset();
    expect(store()).toMatchObject({ preview: null, report: null, importFileUri: null, exportedFileUri: null, error: null });
  });
});
