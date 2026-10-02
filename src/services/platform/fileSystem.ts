import { File, Paths } from 'expo-file-system';
import type { FileSystemAdapter } from '../contracts';

function ensureParent(file: File): void {
  const parent = file.parentDirectory;
  if (!parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }
}

export function createExpoFileSystem(): FileSystemAdapter {
  return {
    get cacheDirectory(): string {
      return Paths.cache.uri;
    },
    async writeText(fileUri, text) {
      const file = new File(fileUri);
      ensureParent(file);
      if (!file.exists) {
        file.create();
      }
      file.write(text);
    },
    readText(fileUri) {
      return new File(fileUri).text();
    },
    async move(fromUri, toUri) {
      const target = new File(toUri);
      ensureParent(target);
      if (target.exists) {
        target.delete();
      }
      await new File(fromUri).move(target);
    },
    async remove(fileUri) {
      const file = new File(fileUri);
      if (file.exists) {
        file.delete();
      }
    },
  };
}
