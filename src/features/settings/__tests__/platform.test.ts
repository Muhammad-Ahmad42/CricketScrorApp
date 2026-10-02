import { Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import { getDocumentAsync } from 'expo-document-picker';
import { readAppInfo, UNKNOWN_VERSION } from '../platform/appInfo';
import { backupFileTypes, pickBackupFile } from '../platform/backupFile';
import { shareText } from '../platform/shareText';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

const getDocument = jest.mocked(getDocumentAsync);

describe('backup file picker', () => {
  beforeEach(() => getDocument.mockReset());

  it('asks for one file copied into the cache so the services can read it', async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/DocumentPicker/city-cup.json', name: 'city-cup.json', lastModified: 0, mimeType: 'application/json' }],
    });
    await expect(pickBackupFile()).resolves.toEqual({ uri: 'file:///cache/DocumentPicker/city-cup.json', name: 'city-cup.json' });
    expect(getDocument).toHaveBeenCalledWith({ type: backupFileTypes(), copyToCacheDirectory: true, multiple: false });
  });

  it('offers only JSON and text files, plus untyped files on Android where some apps save .json without a type (BACKUP_RESTORE §4 stage 1)', () => {
    expect(backupFileTypes('ios')).toEqual(['application/json', 'text/plain']);
    expect(backupFileTypes('android')).toEqual(['application/json', 'text/plain', 'application/octet-stream']);
    expect(backupFileTypes('android')).not.toContain('*/*');
    expect(backupFileTypes('android').some((type) => type.startsWith('image/') || type === 'application/pdf')).toBe(false);
  });

  it('reads the picked file into a self-contained data URI on web, where there is no file system', async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'blob:local/1', base64: 'data:application/json;base64,e30=', name: 'city-cup.json', lastModified: 0, mimeType: 'application/json' }],
    });
    await expect(pickBackupFile('web')).resolves.toEqual({ uri: 'data:application/json;base64,e30=', name: 'city-cup.json' });
    expect(getDocument).toHaveBeenCalledWith({ type: backupFileTypes('web'), copyToCacheDirectory: true, multiple: false, base64: true });
  });

  it('resolves null when the scorer cancels or nothing is returned', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickBackupFile()).resolves.toBeNull();
    getDocument.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickBackupFile()).resolves.toBeNull();
  });
});

describe('app info', () => {
  it('reads the version from the app config and names the platform', () => {
    expect(readAppInfo()).toEqual({ version: '1.0.0', platform: `${Platform.OS} ${String(Platform.Version)}` });
  });

  it('falls back when the config has no version', () => {
    const constants = Constants as { expoConfig: { version?: string } | null };
    const saved = constants.expoConfig;
    constants.expoConfig = null;
    try {
      expect(readAppInfo().version).toBe(UNKNOWN_VERSION);
    } finally {
      constants.expoConfig = saved;
    }
  });
});

describe('share text', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the system share sheet with the text', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await expect(shareText('Scorebook technical details', 'app_version=1.0.0')).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith(
      { title: 'Scorebook technical details', message: 'app_version=1.0.0' },
      { dialogTitle: 'Scorebook technical details' },
    );
  });

  it('reports a failure instead of throwing', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no activity'));
    await expect(shareText('t', 'm')).resolves.toBe(false);
  });
});
