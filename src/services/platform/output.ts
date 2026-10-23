import { File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { PrintAdapter, ShareAdapter, ShareMimeType } from '../contracts';
import { joinPath } from '../core/paths';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const UTI: { readonly [K in ShareMimeType]: string } = {
  'application/pdf': 'com.adobe.pdf',
  'application/json': 'public.json',
};

export const PRINT_DIRECTORY = 'print';

function printedName(uri: string): string {
  const last = (uri.split(/[?#]/)[0] ?? uri).split('/').pop();
  return last !== undefined && last.length > 0 ? last : 'scorebook-print.pdf';
}

function keepInAppCache(name: string, base64: string): string {
  const file = new File(joinPath(Paths.cache.uri, PRINT_DIRECTORY, name));
  const parent = file.parentDirectory;
  if (!parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

export function createExpoPrinter(): PrintAdapter {
  return {
    async printToFile(html) {
      const result = await printToFileAsync({ html, width: A4_WIDTH, height: A4_HEIGHT, base64: true });
      return result.base64 === undefined ? result.uri : keepInAppCache(printedName(result.uri), result.base64);
    },
  };
}

export function createExpoSharer(): ShareAdapter {
  return {
    isAvailable: () => isAvailableAsync(),
    share: (fileUri, options) => shareAsync(fileUri, { mimeType: options.mimeType, UTI: UTI[options.mimeType], dialogTitle: options.dialogTitle }),
  };
}
