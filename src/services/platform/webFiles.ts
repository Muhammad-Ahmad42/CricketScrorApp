import type { FileSystemAdapter, ShareAdapter, ShareMimeType } from '../contracts';

export const WEB_CACHE_DIRECTORY = 'memory://cache/';

export interface WebDownload {
  readonly name: string;
  readonly mimeType: ShareMimeType;
  readonly text: string;
}

export interface WebFileHost {
  readonly download: (file: WebDownload) => void;
  readonly canDownload: () => boolean;
}

export interface WebFileStore {
  readonly fileSystem: FileSystemAdapter;
  readonly sharer: ShareAdapter;
}

const DATA_URI = /^data:([^,]*?)(;base64)?,(.*)$/s;

function fileName(uri: string): string {
  const clean = uri.split(/[?#]/)[0] ?? uri;
  const last = clean.split('/').pop();
  return last && last.length > 0 ? last : 'scorebook-file';
}

function missing(uri: string): Error {
  return new Error(`No file at ${uri}`);
}

function base64Bytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeDataUri(uri: string): string | null {
  const match = DATA_URI.exec(uri);
  if (!match) {
    return null;
  }
  const payload = match[3] ?? '';
  if (match[2]) {
    return new TextDecoder('utf-8').decode(base64Bytes(payload));
  }
  return decodeURIComponent(payload);
}

interface AnchorLike {
  href: string;
  download: string;
  rel: string;
  click(): void;
}

interface DocumentLike {
  createElement(tag: 'a'): AnchorLike;
}

interface UrlFactory {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

function browserDocument(): DocumentLike | null {
  const doc = (globalThis as { document?: DocumentLike }).document;
  return doc && typeof doc.createElement === 'function' ? doc : null;
}

function browserUrls(): UrlFactory | null {
  const urls = (globalThis as { URL?: UrlFactory }).URL;
  return urls && typeof urls.createObjectURL === 'function' ? urls : null;
}

function browserDownload(file: WebDownload): void {
  const doc = browserDocument();
  const urls = browserUrls();
  if (!doc || !urls) {
    throw new Error('Downloads are not available here');
  }
  const objectUrl = urls.createObjectURL(new Blob([file.text], { type: file.mimeType }));
  const anchor = doc.createElement('a');
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => urls.revokeObjectURL(objectUrl), 0);
}

export const BROWSER_FILE_HOST: WebFileHost = {
  download: browserDownload,
  canDownload: () => browserDocument() !== null && browserUrls() !== null,
};

export function createWebFileStore(host: WebFileHost = BROWSER_FILE_HOST): WebFileStore {
  const files = new Map<string, string>();
  const fileSystem: FileSystemAdapter = {
    cacheDirectory: WEB_CACHE_DIRECTORY,
    async writeText(fileUri, text) {
      files.set(fileUri, text);
    },
    async readText(fileUri) {
      const stored = files.get(fileUri) ?? decodeDataUri(fileUri);
      if (stored === null) {
        throw missing(fileUri);
      }
      return stored;
    },
    async move(fromUri, toUri) {
      const text = files.get(fromUri);
      if (text === undefined) {
        throw missing(fromUri);
      }
      files.delete(fromUri);
      files.set(toUri, text);
    },
    async remove(fileUri) {
      files.delete(fileUri);
    },
  };
  const sharer: ShareAdapter = {
    isAvailable: async () => host.canDownload(),
    async share(fileUri, options) {
      const text = files.get(fileUri);
      if (text === undefined) {
        throw missing(fileUri);
      }
      host.download({ name: fileName(fileUri), mimeType: options.mimeType, text });
    },
  };
  return { fileSystem, sharer };
}
