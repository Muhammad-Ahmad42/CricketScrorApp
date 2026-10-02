/** @jest-environment node */
import { WEB_CACHE_DIRECTORY, createWebFileStore, decodeDataUri, type WebDownload, type WebFileHost } from '../platform/webFiles';

function fakeHost(): WebFileHost & { readonly downloads: WebDownload[] } {
  const downloads: WebDownload[] = [];
  return {
    downloads,
    download: jest.fn((file: WebDownload) => {
      downloads.push(file);
    }),
    canDownload: () => true,
  };
}

const EXPORT = `${WEB_CACHE_DIRECTORY}exports/scorebook-backup.json`;
const TEMP = `${EXPORT}.tmp`;

function dataUri(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return `data:application/json;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe('web file store (web-only adapter guard)', () => {
  it('writes, moves and reads backups in memory under the web cache directory', async () => {
    const { fileSystem } = createWebFileStore(fakeHost());
    expect(fileSystem.cacheDirectory).toBe(WEB_CACHE_DIRECTORY);
    await fileSystem.writeText(TEMP, '{"a":1}');
    await fileSystem.move(TEMP, EXPORT);
    await expect(fileSystem.readText(EXPORT)).resolves.toBe('{"a":1}');
    await expect(fileSystem.readText(TEMP)).rejects.toThrow('No file at');
    await fileSystem.remove(EXPORT);
    await expect(fileSystem.readText(EXPORT)).rejects.toThrow('No file at');
    await expect(fileSystem.move(TEMP, EXPORT)).rejects.toThrow('No file at');
  });

  it('reads a picked file from its self-contained data URI, keeping non-ASCII names intact', async () => {
    const { fileSystem } = createWebFileStore(fakeHost());
    const text = '{"team":"Lahore Qalandars – Müller XI"}';
    await expect(fileSystem.readText(dataUri(text))).resolves.toBe(text);
    await expect(fileSystem.readText('data:text/plain,%7B%22a%22%3A1%7D')).resolves.toBe('{"a":1}');
    await expect(fileSystem.readText('blob:local/123')).rejects.toThrow('No file at blob:local/123');
  });

  it('decodes only data URIs', () => {
    expect(decodeDataUri('data:,')).toBe('');
    expect(decodeDataUri('file:///cache/a.json')).toBeNull();
  });

  it('shares a saved backup as a download carrying its text and file name', async () => {
    const host = fakeHost();
    const { fileSystem, sharer } = createWebFileStore(host);
    await fileSystem.writeText(EXPORT, '{"b":2}');
    await expect(sharer.isAvailable()).resolves.toBe(true);
    await sharer.share(EXPORT, { mimeType: 'application/json', dialogTitle: 'Share backup' });
    expect(host.downloads).toEqual([{ name: 'scorebook-backup.json', mimeType: 'application/json', text: '{"b":2}' }]);
    await expect(sharer.share(`${WEB_CACHE_DIRECTORY}gone.json`, { mimeType: 'application/json', dialogTitle: 'x' })).rejects.toThrow('No file at');
  });

  it('reports downloads as unavailable when the host cannot download', async () => {
    const { sharer } = createWebFileStore({ ...fakeHost(), canDownload: () => false });
    await expect(sharer.isAvailable()).resolves.toBe(false);
  });
});
