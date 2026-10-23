import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { createExpoFileSystem } from '../platform/fileSystem';
import { createExpoHapticsDriver } from '../platform/haptics';
import { newSeed, sha256, systemClock } from '../platform/identity';
import { createExpoPrinter, createExpoSharer } from '../platform/output';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(() => Promise.resolve({ uri: 'file:///cache/Print/abc.pdf', numberOfPages: 1 })) }));

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(() => Promise.resolve(true)), shareAsync: jest.fn(() => Promise.resolve()) }));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(() => Promise.resolve('ABCDEF')),
  getRandomValues: jest.fn((array: Uint32Array) => {
    array[0] = 847291;
    return array;
  }),
  randomUUID: jest.fn(() => '0b6f3c1e-8a4e-4c7e-9d0b-2f3a8e1c5d77'),
}));

jest.mock('expo-file-system', () => {
  const store = new Map<string, string>();
  const directories = new Set<string>(['file:///cache']);
  class MockDirectory {
    readonly uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
    get exists(): boolean {
      return directories.has(this.uri);
    }
    create(): void {
      directories.add(this.uri);
    }
  }
  class MockFile {
    readonly uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
    get exists(): boolean {
      return store.has(this.uri);
    }
    get parentDirectory(): MockDirectory {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    create(): void {
      store.set(this.uri, '');
    }
    write(text: string, options?: { readonly encoding?: string }): void {
      store.set(this.uri, options?.encoding === 'base64' ? `base64:${text}` : text);
    }
    text(): Promise<string> {
      const value = store.get(this.uri);
      return value === undefined ? Promise.reject(new Error('missing')) : Promise.resolve(value);
    }
    delete(): void {
      store.delete(this.uri);
    }
    async move(target: MockFile): Promise<void> {
      const value = store.get(this.uri) ?? '';
      store.delete(this.uri);
      store.set(target.uri, value);
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache/' } } };
});

describe('device adapters', () => {
  it('maps haptic strengths to expo-haptics', async () => {
    const driver = createExpoHapticsDriver();
    await driver.impact('heavy');
    await driver.notification('error');
    await driver.selection();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('prints A4 PDFs and shares with the right type identifiers', async () => {
    expect(await createExpoPrinter().printToFile('<html></html>')).toBe('file:///cache/Print/abc.pdf');
    expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: '<html></html>', width: 595, height: 842, base64: true });
    const sharer = createExpoSharer();
    expect(await sharer.isAvailable()).toBe(true);
    await sharer.share('file:///cache/exports/a.json', { mimeType: 'application/json', dialogTitle: 'Save backup' });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/exports/a.json', { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save backup' });
  });

  it("keeps the printed PDF in the app's own cache, where Expo Go may read, move and share it (Android QA)", async () => {
    jest.mocked(Print.printToFileAsync).mockResolvedValueOnce({ uri: 'file:///data/cache/Print/abc-123.pdf', numberOfPages: 1, base64: 'JVBERi0x' });
    const uri = await createExpoPrinter().printToFile('<html></html>');
    expect(uri).toBe('file:///cache/print/abc-123.pdf');
    const fileSystem = createExpoFileSystem();
    expect(await fileSystem.readText(uri)).toBe('base64:JVBERi0x');
    await fileSystem.move(uri, 'file:///cache/exports/scorecard-lions-v-tigers-2026-05-01.pdf');
    expect(await fileSystem.readText('file:///cache/exports/scorecard-lions-v-tigers-2026-05-01.pdf')).toBe('base64:JVBERi0x');
  });

  it('writes, reads, moves and removes files in the cache', async () => {
    const fileSystem = createExpoFileSystem();
    expect(fileSystem.cacheDirectory).toBe('file:///cache/');
    await fileSystem.writeText('file:///cache/exports/a.json.tmp', '{"a":1}');
    await fileSystem.move('file:///cache/exports/a.json.tmp', 'file:///cache/exports/a.json');
    expect(await fileSystem.readText('file:///cache/exports/a.json')).toBe('{"a":1}');
    await expect(fileSystem.readText('file:///cache/exports/a.json.tmp')).rejects.toThrow();
    await fileSystem.writeText('file:///cache/exports/a.json', '{"a":2}');
    expect(await fileSystem.readText('file:///cache/exports/a.json')).toBe('{"a":2}');
    await fileSystem.remove('file:///cache/exports/a.json');
    await fileSystem.remove('file:///cache/exports/a.json');
    await expect(fileSystem.readText('file:///cache/exports/a.json')).rejects.toThrow();
  });

  it('uses expo-crypto for hashes and seeds and the device clock for time', async () => {
    expect(await sha256('abc')).toBe('abcdef');
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', 'abc');
    expect(newSeed()).toBe(847291);
    expect(systemClock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
