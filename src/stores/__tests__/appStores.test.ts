/** @jest-environment node */
import { standaloneWorld } from '@/services/__tests__/support/standalone';
import type { AppServices } from '@/services/contracts';
import { DEFAULT_SETTINGS } from '@/services';
import { useAppStore, useHomeStore, useMatchHistoryStore, useSettingsStore, useToastStore, useTournamentListStore } from '@/stores';
import { clearAppServices, getAppServices, setAppServices } from '@/stores/services';
import { createLeague } from '@/services/__tests__/support/league';
import { expectValue, resetStores, storeHarness } from './support/harness';

jest.setTimeout(60000);

describe('useAppStore', () => {
  it('bootstraps registered services, loads settings and reports resumable matches', async () => {
    const harness = await storeHarness();
    expectValue(await harness.app.settings.update({ theme: 'dark' }));
    const world = await standaloneWorld(harness.app);
    const match = await world.start(harness.app);
    resetStores();
    const pending = useAppStore.getState().bootstrap();
    expect(useAppStore.getState().bootstrap()).toBe(pending);
    expect(await pending).toBe(true);
    expect(useAppStore.getState()).toMatchObject({ status: 'ready', error: null });
    expect(useAppStore.getState().report?.resumable.map((item) => item.id)).toEqual([match.match.id]);
    expect(useSettingsStore.getState()).toMatchObject({ loaded: true, settings: { theme: 'dark' } });
    expect(await useAppStore.getState().bootstrap()).toBe(true);
    expect((await useAppStore.getState().checkIntegrity())?.foreignKeyViolations).toBe(0);
  });

  it('reports a failed bootstrap as an error state with a human message', async () => {
    const harness = await storeHarness();
    resetStores();
    const failing: AppServices = {
      ...harness.app,
      bootstrap: async () => ({ ok: false, error: { code: 'STORAGE', message: "Couldn't open your scorebook data. Nothing has been changed.", domainCode: null, detail: 'SQLITE_CORRUPT' } }),
    };
    setAppServices(failing);
    expect(await useAppStore.getState().bootstrap()).toBe(false);
    expect(useAppStore.getState()).toMatchObject({ status: 'error', error: { code: 'STORAGE', detail: 'SQLITE_CORRUPT' } });
    setAppServices(harness.app);
    expect(await useAppStore.getState().bootstrap()).toBe(true);
  });

  it('throws a programming error when no services are registered and none can be created', () => {
    clearAppServices();
    expect(() => getAppServices()).toThrow('App services have not been initialised');
  });
});

describe('useSettingsStore', () => {
  it('updates optimistically and reverts with a toast when the service refuses', async () => {
    await storeHarness();
    expect(await useSettingsStore.getState().load()).toBe(true);
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(await useSettingsStore.getState().update({ soundEnabled: true, scoring: { ...DEFAULT_SETTINGS.scoring, padHand: 'left' } })).toBe(true);
    expect(useSettingsStore.getState().settings).toMatchObject({ soundEnabled: true, scoring: { padHand: 'left' } });
    const update = useSettingsStore.getState().update({ defaultFormatId: ' ' });
    expect(useSettingsStore.getState().settings.defaultFormatId).toBe(' ');
    expect(await update).toBe(false);
    expect(useSettingsStore.getState().settings.defaultFormatId).toBe(DEFAULT_SETTINGS.defaultFormatId);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: 'error' });
  });
});

describe('useToastStore', () => {
  it('shows, caps and dismisses toasts', () => {
    resetStores();
    const ids = ['a', 'b', 'c', 'd'].map((message) => useToastStore.getState().show({ kind: 'info', message, action: null }));
    expect(new Set(ids).size).toBe(4);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['b', 'c', 'd']);
    useToastStore.getState().dismiss(ids[2]);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['b', 'd']);
  });
});

describe('useHomeStore', () => {
  it('loads continue, recent and tournaments and handles SAVE & EXIT and DISCARD', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    const first = await world.start(harness.app);
    const second = await world.start(harness.app);
    const finished = expectValue(await harness.app.matches.createMatch(world.input({ title: 'Walkover' })));
    expectValue(await harness.app.matches.endMatch(finished.match.id, 0, { type: 'walkover', winnerTeamId: world.lions.team.id, reason: null }, null));
    await useAppStore.getState().bootstrap();
    expect(await useHomeStore.getState().load()).toBe(true);
    expect(useHomeStore.getState().resumable.map((item) => item.id).sort()).toEqual([first.match.id, second.match.id].sort());
    expect(useHomeStore.getState().recent.map((item) => item.id)).toEqual([finished.match.id]);
    expect(useHomeStore.getState().tournaments).toEqual([]);
    expect(await useHomeStore.getState().dismissResume(first.match.id)).toBe(true);
    expect(useAppStore.getState().report?.resumable.map((item) => item.id)).toEqual([second.match.id]);
    expect(useHomeStore.getState().resumable).toHaveLength(2);
    expect(await useHomeStore.getState().discard(second.match.id)).toBe(true);
    expect(useHomeStore.getState().resumable.map((item) => item.id)).toEqual([first.match.id]);
    expect(await useHomeStore.getState().discard(finished.match.id)).toBe(false);
    expect(useToastStore.getState().toasts[useToastStore.getState().toasts.length - 1]).toMatchObject({ kind: 'error' });
  });
});

describe('useMatchHistoryStore and useTournamentListStore', () => {
  it('pages, searches and removes matches', async () => {
    const harness = await storeHarness();
    const world = await standaloneWorld(harness.app);
    for (let index = 0; index < 5; index += 1) {
      const live = await world.start(harness.app, { title: `Match ${index}` });
      expectValue(await harness.app.matches.record(live.match.id, 1, [
        { kind: 'delivery', strikerId: world.lions.p(1), nonStrikerId: world.lions.p(2), bowlerId: world.tigers.p(7), runsRun: 1, shortRuns: 0, boundary: 0, wicket: null, call: 'fair', runsTo: 'bat' },
      ]));
    }
    expect(await useMatchHistoryStore.getState().load({ sort: 'recent', limit: 2 })).toBe(true);
    expect(useMatchHistoryStore.getState().items).toHaveLength(2);
    expect(await useMatchHistoryStore.getState().loadMore()).toBe(true);
    expect(await useMatchHistoryStore.getState().loadMore()).toBe(true);
    expect(useMatchHistoryStore.getState().items).toHaveLength(5);
    expect(await useMatchHistoryStore.getState().loadMore()).toBe(false);
    const removed = useMatchHistoryStore.getState().items[0].id;
    expect(await useMatchHistoryStore.getState().remove(removed)).toBe(true);
    expect(useMatchHistoryStore.getState().items.map((item) => item.id)).not.toContain(removed);
    expect(useMatchHistoryStore.getState().items).toHaveLength(4);
    expect(await useMatchHistoryStore.getState().load({ search: 'Match 3' })).toBe(true);
    expect(useMatchHistoryStore.getState().items.map((item) => item.title)).toEqual(['Match 3']);
    expect(await useMatchHistoryStore.getState().remove('missing')).toBe(false);
    expect(useMatchHistoryStore.getState().error?.code).toBe('NOT_FOUND');
  });

  it('lists tournaments', async () => {
    const harness = await storeHarness();
    await createLeague(harness.app);
    expect(await useTournamentListStore.getState().load()).toBe(true);
    expect(useTournamentListStore.getState().items.map((item) => [item.name, item.fixturesTotal])).toEqual([['Spring League', 12]]);
  });
});
