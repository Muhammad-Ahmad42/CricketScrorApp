import { Platform } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';

export interface PickedFile {
  readonly uri: string;
  readonly name: string;
}

export const BACKUP_FILE_TYPES: readonly string[] = ['application/json', 'text/plain'];

export const ANDROID_UNTYPED_FILE = 'application/octet-stream';

export function backupFileTypes(os: string = Platform.OS): string[] {
  return os === 'android' ? [...BACKUP_FILE_TYPES, ANDROID_UNTYPED_FILE] : [...BACKUP_FILE_TYPES];
}

export async function pickBackupFile(os: string = Platform.OS): Promise<PickedFile | null> {
  const web = os === 'web';
  const result = await getDocumentAsync({ type: backupFileTypes(os), copyToCacheDirectory: true, multiple: false, ...(web ? { base64: true } : {}) });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset) {
    return null;
  }
  const uri = web && asset.base64 ? asset.base64 : asset.uri;
  return { uri, name: asset.name };
}
