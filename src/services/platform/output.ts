import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { PrintAdapter, ShareAdapter, ShareMimeType } from '../contracts';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const UTI: { readonly [K in ShareMimeType]: string } = {
  'application/pdf': 'com.adobe.pdf',
  'application/json': 'public.json',
};

export function createExpoPrinter(): PrintAdapter {
  return {
    async printToFile(html) {
      const result = await printToFileAsync({ html, width: A4_WIDTH, height: A4_HEIGHT });
      return result.uri;
    },
  };
}

export function createExpoSharer(): ShareAdapter {
  return {
    isAvailable: () => isAvailableAsync(),
    share: (fileUri, options) => shareAsync(fileUri, { mimeType: options.mimeType, UTI: UTI[options.mimeType], dialogTitle: options.dialogTitle }),
  };
}
