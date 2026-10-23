import '@/ui/testing';
import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { getDocumentAsync } from 'expo-document-picker';
import type { AppSettings, BackupData, ImportPreview } from '@/domain/types';
import { renderWithTheme, touchTargetSize } from '@/ui/testing';
import { lightColors } from '@/ui/theme';
import { IDS, tournamentBackup } from '@/export/backup/__tests__/fixtures/backupData';
import { dataOf, exportText, previewText, tamper } from '@/export/backup/__tests__/support/files';
import { pickBackupFile } from '../platform/backupFile';
import { shareText } from '../platform/shareText';
import { AboutScreen } from '../screens/AboutScreen';
import { BackupScreen } from '../screens/BackupScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import {
  BACKUP_URI,
  PICKED_URI,
  appSettings,
  bootstrapReport,
  conflict,
  importPreview,
  integrityReport,
  issue,
  serviceError,
  tournamentItem,
} from './support/fixtures';
import {
  resetFakeStores,
  useFakeAppStore,
  useFakeBackupStore,
  useFakeExportStore,
  useFakeSettingsStore,
  useFakeToastStore,
  useFakeTournamentListStore,
} from './support/fakeStores';
import { expectProblem } from './support/problem';
import { resetRouter } from './support/router';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../platform/appInfo', () => ({ readAppInfo: () => ({ version: '1.0.0', platform: 'android 35' }) }));
jest.mock('../platform/backupFile', () => ({ pickBackupFile: jest.fn() }));
jest.mock('../platform/shareText', () => ({ shareText: jest.fn(async () => true) }));

interface TreeNode {
  readonly props: Record<string, unknown>;
  readonly children: readonly (TreeNode | string)[];
}

const picker = jest.mocked(pickBackupFile);
const detailsShare = jest.mocked(shareText);
const SCORING = appSettings().scoring;
const STALE_MATCH_BACKUP = 'file:///cache/exports/match-backup-lions-v-tigers-2026-09-29.json';
const CODE_LIKE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/;
const PATH_LIKE = /\bdata\.[A-Za-z]+|\[\d+\]|\bcounts\.[A-Za-z]+/;
const CAMEL_CASE = /\b[a-z]+[A-Z][A-Za-z]*\b/;
const STACK_LIKE = /SyntaxError|TypeError|RangeError|Unexpected token|JSON\.parse|at position|^\s*at\s|Error:|undefined|\[object Object\]|\bNaN\b/m;

beforeEach(() => {
  resetFakeStores();
  resetRouter();
  picker.mockReset();
  picker.mockResolvedValue({ uri: PICKED_URI, name: 'city-cup.json' });
  detailsShare.mockClear();
  detailsShare.mockResolvedValue(true);
  jest.mocked(getDocumentAsync).mockReset();
});

function settings(): AppSettings {
  return useFakeSettingsStore.getState().settings;
}

function textsIn(node: TreeNode): string[] {
  const out: string[] = [];
  const visit = (current: TreeNode | string): void => {
    if (typeof current === 'string') {
      out.push(current);
      return;
    }
    if (typeof current.props.accessibilityLabel === 'string') {
      out.push(current.props.accessibilityLabel);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return out;
}

function testIdsIn(node: TreeNode): string[] {
  const out: string[] = [];
  const visit = (current: TreeNode | string): void => {
    if (typeof current === 'string') {
      return;
    }
    if (typeof current.props.testID === 'string') {
      out.push(current.props.testID);
    }
    current.children.forEach(visit);
  };
  visit(node);
  return out;
}

function previewWith(preview: ImportPreview): void {
  useFakeBackupStore.setState({
    previewImport: jest.fn(async (fileUri: string) => {
      useFakeBackupStore.setState({ importFileUri: fileUri, preview });
      return true;
    }),
  });
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.press(screen.getByTestId('backup-btn-import'));
  await waitFor(() => expect(screen.getByTestId('import-group-preview')).toBeOnTheScreen());
}

function expectAccessibleTargets(controls: readonly TreeNode[]): void {
  for (const control of controls) {
    expect(String(control.props.accessibilityLabel ?? '').trim().length).toBeGreaterThan(0);
    expect(touchTargetSize(control).height).toBeGreaterThanOrEqual(44);
  }
}

function edited(change: (data: BackupData) => BackupData): string {
  return exportText(change(tournamentBackup()));
}

const VALID_FILE = exportText(tournamentBackup());

describe('settings: theme, feedback and motion persist through the store (W-G1, §70, §76–§78)', () => {
  it('offers exactly Light, Dark and System as one radio group and persists every choice', async () => {
    useFakeSettingsStore.setState({ settings: appSettings({ theme: 'dark' }) });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    const radios = within(screen.getByTestId('settings-group-theme')).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => String(radio.props.accessibilityLabel))).toEqual([
      expect.stringMatching(/light/i),
      expect.stringMatching(/dark/i),
      expect.stringMatching(/system/i),
    ]);
    expect(radios.filter((radio) => radio.props.accessibilityState?.selected === true)).toHaveLength(1);
    expect(screen.getByTestId('settings-chip-theme-dark')).toBeSelected();
    const update = useFakeSettingsStore.getState().update;
    await user.press(screen.getByTestId('settings-chip-theme-light'));
    await user.press(screen.getByTestId('settings-chip-theme-system'));
    await user.press(screen.getByTestId('settings-chip-theme-dark'));
    expect(jest.mocked(update).mock.calls.map((call) => call[0])).toEqual([{ theme: 'light' }, { theme: 'system' }, { theme: 'dark' }]);
    await waitFor(() => expect(screen.getByTestId('settings-chip-theme-dark')).toBeSelected());
    expect(settings().theme).toBe('dark');
  });

  it('switches vibration off and back on, each time through store.update, as an accessible switch', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    const haptics = screen.getByRole('switch', { name: /vibration/i });
    expect(haptics).toBeChecked();
    await user.press(haptics);
    await waitFor(() => expect(screen.getByRole('switch', { name: /vibration/i })).not.toBeChecked());
    await user.press(screen.getByRole('switch', { name: /vibration/i }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /vibration/i })).toBeChecked());
    expect(jest.mocked(useFakeSettingsStore.getState().update).mock.calls.map((call) => call[0])).toEqual([
      { hapticsEnabled: false },
      { hapticsEnabled: true },
    ]);
    expect(settings().hapticsEnabled).toBe(true);
  });

  it('offers System, On and Off for reduced motion and persists each one', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    const radios = within(screen.getByTestId('settings-group-motion')).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    await user.press(screen.getByTestId('settings-chip-motion-on'));
    await user.press(screen.getByTestId('settings-chip-motion-off'));
    await user.press(screen.getByTestId('settings-chip-motion-system'));
    expect(jest.mocked(useFakeSettingsStore.getState().update).mock.calls.map((call) => call[0])).toEqual([
      { reducedMotion: 'on' },
      { reducedMotion: 'off' },
      { reducedMotion: 'system' },
    ]);
    expect(settings().reducedMotion).toBe('system');
  });

  it('hides the sound effects setting until the feature exists, even when a restored backup stored it as on (§77, DESIGN_SYSTEM §9)', async () => {
    useFakeSettingsStore.setState({ settings: appSettings({ soundEnabled: true }) });
    await renderWithTheme(<SettingsScreen />);
    expect(screen.queryByTestId('settings-toggle-sound')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Sound effects|Not available in this version/)).not.toBeOnTheScreen();
    expect(screen.getByTestId('settings-toggle-haptics')).toBeOnTheScreen();
  });

  it('keeps both scoring choices when two are made before the store has committed the first write', async () => {
    const commits: (() => void)[] = [];
    const update = jest.fn(
      (patch: Partial<AppSettings>) =>
        new Promise<boolean>((resolve) => {
          commits.push(() => {
            useFakeSettingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }));
            resolve(true);
          });
        }),
    );
    useFakeSettingsStore.setState({ update });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-chip-dot-dot'));
    await user.press(screen.getByTestId('settings-chip-pad-left'));
    await act(async () => {
      commits.splice(0).forEach((commit) => commit());
    });
    expect(settings().scoring).toEqual({ ...SCORING, dotStyle: 'dot', padHand: 'left' });
    const lastWrite = update.mock.calls[update.mock.calls.length - 1]?.[0];
    expect(lastWrite?.scoring).toEqual({ ...SCORING, dotStyle: 'dot', padHand: 'left' });
  });

  it('never overwrites the stored scoring preferences with defaults while the settings are still loading', async () => {
    const stored = appSettings({
      scoring: { confirmInningsEnd: true, autoPromptBowler: false, dotStyle: 'zero', keepAwake: false },
    });
    let finishLoad: () => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishLoad = () => {
            useFakeSettingsStore.setState({ loaded: true, settings: stored });
            resolve(true);
          };
        }),
    );
    useFakeSettingsStore.setState({ loaded: false, settings: appSettings(), load });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await user.press(screen.getByTestId('settings-chip-dot-dot'));
    await act(async () => finishLoad());
    const scoringWrites = jest
      .mocked(useFakeSettingsStore.getState().update)
      .mock.calls.map((call) => call[0].scoring)
      .filter((scoring) => scoring !== undefined);
    for (const scoring of scoringWrites) {
      expect(scoring).toMatchObject({ confirmInningsEnd: true, autoPromptBowler: false, keepAwake: false });
    }
  });

  it('locks the settings while they load and offers Try again when loading fails', async () => {
    const load = jest.fn(async () => false);
    useFakeSettingsStore.setState({ loaded: false, load });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await expectProblem('settings-banner-load-error', "Couldn't load settings", 'Nothing was changed.');
    expect(screen.getByTestId('settings-chip-dot-dot')).toBeDisabled();
    expect(screen.getByTestId('settings-chip-theme-dark')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /vibration/i })).toBeDisabled();
    await user.press(screen.getByTestId('settings-chip-theme-dark'));
    expect(useFakeSettingsStore.getState().update).not.toHaveBeenCalled();
    load.mockImplementation(async () => {
      useFakeSettingsStore.setState({ loaded: true });
      return true;
    });
    await user.press(screen.getByTestId('settings-btn-retry-load'));
    await waitFor(() => expect(screen.queryByTestId('settings-banner-load-error')).not.toBeOnTheScreen());
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('settings-chip-dot-dot')).toBeEnabled();
  });

  it('retries a failed scoring save without undoing a later scoring change', async () => {
    const update = jest.fn(async (patch: Partial<AppSettings>) => {
      if (patch.scoring?.dotStyle === 'dot' && update.mock.calls.length === 1) {
        return false;
      }
      useFakeSettingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }));
      return true;
    });
    useFakeSettingsStore.setState({ update });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-chip-dot-dot'));
    const toast = jest.mocked(useFakeToastStore.getState().show).mock.calls[0]?.[0];
    expect(toast?.message).toBe("Couldn't save this setting.");
    await user.press(screen.getByTestId('settings-chip-pad-left'));
    expect(settings().scoring).toEqual({ ...SCORING, padHand: 'left' });
    await act(async () => toast?.action?.run());
    await waitFor(() => expect(settings().scoring).toEqual({ ...SCORING, dotStyle: 'dot', padHand: 'left' }));
  });

  it('keeps every settings control labelled and at least 44 pt, in the dark theme too (§72, §78)', async () => {
    useFakeSettingsStore.setState({ settings: appSettings({ theme: 'dark' }) });
    await renderWithTheme(<SettingsScreen />, { mode: 'dark' });
    const controls = [...screen.getAllByRole('radio'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('button')];
    expect(controls.length).toBeGreaterThanOrEqual(20);
    expectAccessibleTargets(controls);
    for (const toggle of screen.getAllByRole('switch')) {
      expect(typeof toggle.props.accessibilityState?.checked).toBe('boolean');
    }
  });
});

describe('privacy (§85)', () => {
  it('states every §85 promise on the About screen', async () => {
    await renderWithTheme(<AboutScreen />);
    const text = textsIn(screen.getByTestId('screen-about')).join(' ');
    expect(text).toMatch(/no account/i);
    expect(text).toMatch(/login|sign-up|sign up/i);
    expect(text).toMatch(/without internet|offline/i);
    expect(text).toMatch(/tracking/i);
    expect(text).toMatch(/advertising|\bads\b/i);
    expect(text).toMatch(/cloud/i);
    expect(text).toMatch(/export/i);
  });

  it('names every way data can leave the phone, including the diagnostics technical details', async () => {
    await renderWithTheme(<AboutScreen />);
    const text = textsIn(screen.getByTestId('screen-about')).join(' ');
    expect(text).toMatch(/technical details/i);
  });

  it('never exports, shares or checks anything until the organizer asks', async () => {
    const backup = await renderWithTheme(<BackupScreen />);
    await backup.unmount();
    const diagnostics = await renderWithTheme(<DiagnosticsScreen />);
    await diagnostics.unmount();
    await renderWithTheme(<SettingsScreen />);
    expect(useFakeBackupStore.getState().exportBackup).not.toHaveBeenCalled();
    expect(useFakeExportStore.getState().share).not.toHaveBeenCalled();
    expect(detailsShare).not.toHaveBeenCalled();
    expect(useFakeAppStore.getState().checkIntegrity).not.toHaveBeenCalled();
    expect(picker).not.toHaveBeenCalled();
  });
});

describe('backup export shares a .json file (§84, BACKUP_RESTORE §3)', () => {
  it('shares exactly the exported .json file as application/json and shows only its file name', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-full'));
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledTimes(1));
    const [uri, mime] = jest.mocked(useFakeExportStore.getState().share).mock.calls[0];
    expect(uri).toBe(BACKUP_URI);
    expect(uri).toMatch(/\.json$/);
    expect(mime).toBe('application/json');
    expect(await screen.findByTestId('backup-text-exported')).toHaveTextContent('Saved as scorebook-backup-2026-09-30.json');
    expect(screen.queryByText(/file:\/\/|\/cache\//)).not.toBeOnTheScreen();
  });

  it('shares the tournament file it just wrote, never a file left over from another export', async () => {
    const tournamentUri = 'file:///cache/exports/tournament-backup-city-cup-2026-09-30.json';
    useFakeTournamentListStore.setState({ items: [tournamentItem()] });
    useFakeBackupStore.setState({
      exportedFileUri: STALE_MATCH_BACKUP,
      exportBackup: jest.fn(async () => {
        useFakeBackupStore.setState({ exportedFileUri: tournamentUri });
        return tournamentUri;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-tournament'));
    await user.press(await screen.findByTestId('backup-row-tournament-1'));
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledTimes(1));
    expect(useFakeExportStore.getState().share).toHaveBeenCalledWith(tournamentUri, 'application/json');
    expect(useFakeBackupStore.getState().exportBackup).toHaveBeenCalledWith({ kind: 'tournament', tournamentId: 'tour-1' });
  });

  it('does not re-share the earlier file when a second export fails, and explains without technical text', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-full'));
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledTimes(1));
    await act(async () => {
      useFakeBackupStore.setState({
        exportBackup: jest.fn(async () => {
          useFakeBackupStore.setState({ error: serviceError({ code: 'EXPORT_FAILED', detail: 'ENOSPC: no space left on device, write' }) });
          return null;
        }),
      });
    });
    await user.press(screen.getByTestId('backup-btn-export-full'));
    await expectProblem('backup-banner-export-error', "Couldn't save the backup", 'Your data is safe.');
    expect(useFakeExportStore.getState().share).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/ENOSPC|EXPORT_FAILED/)).not.toBeOnTheScreen();
  });

  it('does not present a backup made elsewhere (a scorecard match backup) as saved from this screen', async () => {
    useFakeBackupStore.setState({ exportedFileUri: STALE_MATCH_BACKUP });
    await renderWithTheme(<BackupScreen />);
    expect(screen.queryByTestId('backup-text-exported')).not.toBeOnTheScreen();
    expect(screen.queryByText(/match-backup-lions-v-tigers/)).not.toBeOnTheScreen();
  });
});

describe('import never applies without a preview, a policy and, for replace, a confirmation (§84, BACKUP_RESTORE §8)', () => {
  it('offers no Import action before the chosen file has been checked', async () => {
    let finish: () => void = () => undefined;
    const previewImport = jest.fn(
      (fileUri: string) =>
        new Promise<boolean>((resolve) => {
          finish = () => {
            useFakeBackupStore.setState({ importFileUri: fileUri, preview: importPreview({ conflicts: [conflict()] }) });
            resolve(true);
          };
        }),
    );
    useFakeBackupStore.setState({ previewImport });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('backup-btn-import'));
    await waitFor(() => expect(previewImport).toHaveBeenCalledWith(PICKED_URI));
    expect(screen.getByTestId('import-text-checking')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('import-chip-policy-replace')).not.toBeOnTheScreen();
    expect(screen.getByTestId('backup-btn-import')).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByTestId('import-btn-apply')).toBeOnTheScreen();
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
  });

  it('never leaves the first file armed when a second file cannot be checked', async () => {
    previewWith(importPreview({ conflicts: [conflict()] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-btn-apply')).toBeOnTheScreen();
    picker.mockResolvedValue({ uri: 'file:///cache/DocumentPicker/photo.jpg', name: 'photo.jpg' });
    await act(async () => {
      useFakeBackupStore.setState({
        previewImport: jest.fn(async () => {
          useFakeBackupStore.setState({
            error: serviceError({ code: 'IMPORT_INVALID', message: "Couldn't read this file. Nothing on this phone was changed.", detail: 'File too large: 104857601 bytes' }),
          });
          return false;
        }),
      });
    });
    await user.press(screen.getByTestId('backup-btn-import'));
    await expectProblem('import-banner-error', "Couldn't read this file", 'Nothing on this phone was changed.');
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('import-group-preview')).not.toBeOnTheScreen();
    expect(screen.queryByText(/104857601|File too large/)).not.toBeOnTheScreen();
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
  });

  it('applies the previewed file with the last policy the organizer chose, without a dialog for a copy', async () => {
    previewWith(importPreview({ conflicts: [conflict({ localOnly: { matches: 2, events: 90 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    const chips = ['skip', 'copy', 'replace'].map((chip) => screen.getByTestId(`import-chip-policy-${chip}`));
    for (const chip of chips) {
      expect(chip).toHaveProp('accessibilityRole', 'radio');
    }
    expect(screen.getByTestId('import-chip-policy-skip')).toBeChecked();
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-chip-policy-copy'));
    expect(screen.getByTestId('import-chip-policy-copy')).toBeChecked();
    expect(screen.getByTestId('import-chip-policy-replace')).not.toBeChecked();
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen();
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledTimes(1);
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'import_as_copy');
  });

  it('shows the local-only matches and events before the policy options, and the replace option says what is lost in words and an icon', async () => {
    previewWith(importPreview({ conflicts: [conflict({ label: 'Spring Cup', localOnly: { matches: 3, events: 412 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    const order = testIdsIn(screen.getByTestId('screen-backup'));
    const at = (id: string) => order.indexOf(id);
    expect(at('import-row-conflict-1')).toBeGreaterThanOrEqual(0);
    expect(at('import-row-conflict-1')).toBeLessThan(at('import-chip-policy-skip'));
    expect(at('import-chip-policy-replace')).toBeLessThan(at('import-btn-apply'));
    expect(screen.getByTestId('import-row-conflict-1')).toHaveAccessibleName(/Spring Cup.*3 matches.*412 scoring events.*only on this phone/);
    const replace = screen.getByTestId('import-chip-policy-replace');
    const loss = within(replace).getByText('3 matches recorded only on this phone will be lost');
    expect(loss).toHaveStyle({ color: lightColors.danger });
    expect(within(replace).getByTestId('lucide-triangle-alert')).toBeOnTheScreen();
    expect(replace).toHaveAccessibleName(/3 matches recorded only on this phone will be lost/);
  });

  it('asks for a destructive confirmation that names lost scoring events and applies replace only after it', async () => {
    previewWith(importPreview({ conflicts: [conflict({ localOnly: { matches: 0, events: 12 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(within(screen.getByTestId('import-chip-policy-replace')).getByText('12 scoring events recorded only on this phone will be lost')).toBeOnTheScreen();
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    const message = screen.getByTestId('import-text-replace-message');
    expect(message).toHaveTextContent(/12 scoring events/);
    expect(message).toHaveTextContent(/can't be undone/);
    expect(screen.getByTestId('import-btn-confirm-replace')).toHaveAccessibleName('Replace');
    await user.press(screen.getByTestId('import-btn-cancel-replace'));
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen());
    await user.press(screen.getByTestId('import-btn-apply'));
    await user.press(await screen.findByTestId('import-btn-confirm-replace'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledTimes(1);
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'replace_existing');
  });

  it('still asks before replacing when only library rows (teams) already exist', async () => {
    previewWith(importPreview({ conflicts: [conflict({ entity: 'team', id: 'team-1', label: 'Lions' })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(screen.getByTestId('dialog-import-replace')).toBeOnTheScreen();
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('import-btn-confirm-replace'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'replace_existing');
  });

  it('runs a confirmed replace only once when Replace is tapped twice in quick succession', async () => {
    previewWith(importPreview({ conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    const confirm = await screen.findByTestId('import-btn-confirm-replace');
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    await waitFor(() => expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen());
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledTimes(1);
  });

  it('ignores a Replace tap that lands after Cancel while the dialog is still closing', async () => {
    previewWith(importPreview({ conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    const cancel = await screen.findByTestId('import-btn-cancel-replace');
    const confirm = screen.getByTestId('import-btn-confirm-replace');
    await fireEvent.press(cancel);
    await fireEvent.press(confirm);
    await waitFor(() => expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen());
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('import-btn-apply'));
    await user.press(await screen.findByTestId('import-btn-confirm-replace'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledTimes(1);
  });

  it('starts one import even when Import is tapped twice while it is running', async () => {
    let finish: () => void = () => undefined;
    const applyImport = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(false);
        }),
    );
    useFakeBackupStore.setState({ applyImport });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-btn-apply'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(applyImport).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('backup-btn-import')).toBeDisabled();
    expect(screen.getByTestId('backup-btn-export-full')).toBeDisabled();
    await act(async () => finish());
  });

  it('offers neither a policy nor Import for an invalid file, even when it also lists conflicts', async () => {
    previewWith(
      importPreview({
        ok: false,
        issues: [issue('error', 'CHECKSUM_MISMATCH', 'This file was changed or damaged after it was exported.')],
        conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })],
      }),
    );
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    for (const chip of ['skip', 'copy', 'replace']) {
      expect(screen.queryByTestId(`import-chip-policy-${chip}`)).not.toBeOnTheScreen();
    }
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Import$/ })).not.toBeOnTheScreen();
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
  });
});

describe('real validation results reach the organizer in plain words (§86, E2E-14, FR-04)', () => {
  const broken: readonly (readonly [string, string])[] = [
    ['text that is not JSON', '{"format":'],
    ['an empty file', ''],
    ['a file from another app', JSON.stringify({ format: 'other-app', data: {} })],
    ['a newer backup format', tamper(VALID_FILE, (file) => (file.formatVersion = 99))],
    ['a newer database version', tamper(VALID_FILE, (file) => (file.schemaVersion = 99))],
    ['a file edited after export', tamper(VALID_FILE, (file) => (dataOf(file).teams[0].name = 'Edited Lions'))],
    ['a badly formatted date', edited((data) => ({ ...data, matches: data.matches.map((row, i) => (i === 0 ? { ...row, scheduledDate: '31/12/2026' } : row)) }))],
    ['a reference to a missing team', edited((data) => ({ ...data, matches: data.matches.map((row, i) => (i === 0 ? { ...row, teamAId: 'team-ghost' } : row)) }))],
    ['the same team twice', edited((data) => ({ ...data, teams: [...data.teams, data.teams[0]] }))],
  ];

  it.each(broken)('lists the problems of %s without codes, paths or stack text, and hides Import', async (_label, text) => {
    const preview = previewText(text);
    expect(preview.ok).toBe(false);
    previewWith(preview);
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    const first = screen.getByTestId('import-row-issue-1');
    expect(first).toHaveAccessibleName(/^Problem: /);
    const shown = textsIn(screen.getByTestId('import-group-preview'));
    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) {
      expect(line).not.toMatch(CODE_LIKE);
      expect(line).not.toMatch(PATH_LIKE);
      expect(line).not.toMatch(CAMEL_CASE);
      expect(line).not.toMatch(STACK_LIKE);
    }
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
  });

  it('tells the organizer that a tampered file was changed after export (BACKUP_RESTORE §4 stage 4)', async () => {
    previewWith(previewText(tamper(VALID_FILE, (file) => (dataOf(file).teams[0].name = 'Edited Lions'))));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-row-issue-1')).toHaveAccessibleName('Problem: This file was changed or damaged after it was exported.');
    expect(screen.getByTestId('import-text-summary')).toHaveTextContent("This file can't be imported");
  });

  it('walks a real re-import on the same phone from the duplicate warning to a confirmed replace (FR-06a/e, E2E-12)', async () => {
    const data = tournamentBackup();
    const fileEvents = data.matchEvents.filter((event) => event.matchId === IDS.match1).length;
    const preview = previewText(VALID_FILE, {
      local: {
        existingIds: { tournament: new Set([IDS.tournament]) },
        footprint: (_entity, id) => (id === IDS.tournament ? { matchIds: [IDS.match1, 'match-local-only'], events: fileEvents + 37 } : null),
        previouslyImportedAt: '2026-09-29T12:00:00.000Z',
      },
    });
    expect(preview.ok).toBe(true);
    previewWith(preview);
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-text-previously-imported')).toHaveTextContent(/Imported before on 29 Sep 2026/);
    expect(screen.getByTestId('import-row-conflict-1')).toHaveAccessibleName(/Spring Cup.*1 match.*37 scoring events.*only on this phone/);
    expect(screen.getByTestId('import-chip-policy-replace')).toHaveAccessibleName(/1 match recorded only on this phone will be lost/);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(screen.getByTestId('import-text-replace-message')).toHaveTextContent(/1 match and 37 scoring events recorded only on this phone will be deleted/);
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('import-btn-confirm-replace'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'replace_existing');
  });

  it('says that the app settings of a full backup are not restored, and the import leaves them untouched (BACKUP_RESTORE §5, §8 rule 6; G-16)', async () => {
    const preview = previewText(exportText(tournamentBackup(), { kind: 'full' }));
    expect(preview.ok).toBe(true);
    expect(preview.counts.settings).toBe(1);
    previewWith(preview);
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-text-settings-kept')).toHaveTextContent('Not restored');
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(await screen.findByTestId('import-text-report')).toBeOnTheScreen();
    expect(useFakeSettingsStore.getState().update).not.toHaveBeenCalled();
    expect(useFakeSettingsStore.getState().load).not.toHaveBeenCalled();
  });

  it('does not mention app settings for a backup that carries none', async () => {
    const preview = previewText(exportText({ ...tournamentBackup(), settings: null }, { kind: 'tournament', tournamentId: IDS.tournament }));
    expect(preview.ok).toBe(true);
    expect(preview.counts.settings).toBe(0);
    previewWith(preview);
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.queryByTestId('import-text-settings-kept')).not.toBeOnTheScreen();
  });

  it('summarises a real tournament backup with its tournament, export date and app version (W-X1, BACKUP_RESTORE §10)', async () => {
    previewWith(previewText(exportText(tournamentBackup(), { kind: 'tournament', tournamentId: IDS.tournament })));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    const summary = textsIn(screen.getByTestId('import-group-preview')).join(' ');
    expect(summary).toMatch(/Tournament backup/);
    expect(summary).toMatch(/exported (30 Sep|1 Oct) 2026/i);
    expect(summary).toMatch(/Scorebook 1\.0\.0/);
    expect(summary).toMatch(/Spring Cup/);
  });

  it('asks the system picker for JSON or text files copied into the cache (BACKUP_RESTORE §4 stage 1)', async () => {
    jest.mocked(getDocumentAsync).mockResolvedValue({ canceled: true, assets: null });
    const real: typeof import('../platform/backupFile') = jest.requireActual('../platform/backupFile');
    await expect(real.pickBackupFile()).resolves.toBeNull();
    const options = jest.mocked(getDocumentAsync).mock.calls[0]?.[0];
    expect(options?.copyToCacheDirectory).toBe(true);
    expect(options?.type).toEqual(expect.arrayContaining(['application/json', 'text/plain']));
  });
});

describe('backup screen accessibility (§72, §78)', () => {
  it('labels every control and keeps it at least 44 pt through export, preview and the replace dialog', async () => {
    previewWith(importPreview({ previouslyImportedAt: '2026-09-29T12:00:00.000Z', conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-full'));
    expect(await screen.findByTestId('backup-btn-share')).toBeOnTheScreen();
    await chooseFile(user);
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')];
    expect(controls.length).toBeGreaterThanOrEqual(8);
    expectAccessibleTargets(controls);
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityState?.checked)).toEqual([true, false, false]);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expectAccessibleTargets([screen.getByTestId('import-btn-confirm-replace'), screen.getByTestId('import-btn-cancel-replace')]);
  });
});

describe('diagnostics keeps technical details off screen until asked (§86, §93, W-X3)', () => {
  it('shows no codes, details, stack text or ids on screen and shares them only from the explicit button', async () => {
    const matchId = '7f0c2a9e-1b3d-4c5e-8f6a-0b1c2d3e4f50';
    useFakeAppStore.setState({
      report: bootstrapReport({ integrityIssues: [{ matchId, message: 'Lions v Tigers needs repair.' }] }),
      error: serviceError({
        code: 'STORAGE',
        message: "Couldn't open your scorebook data. Your data is safe.",
        domainCode: 'MIGRATION_FAILED',
        detail: 'Error: SQLITE_CORRUPT: database disk image is malformed\n    at openDatabase (client.ts:12:5)',
      }),
    });
    useFakeExportStore.setState({ error: serviceError({ code: 'EXPORT_FAILED', detail: 'ENOSPC: no space left on device' }) });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    const shown = textsIn(screen.getByTestId('screen-diagnostics'));
    for (const line of shown) {
      expect(line).not.toMatch(/SQLITE|openDatabase|MIGRATION_FAILED|STORAGE|EXPORT_FAILED|ENOSPC/);
      expect(line).not.toMatch(STACK_LIKE);
      expect(line).not.toContain(matchId);
    }
    expect(useFakeAppStore.getState().checkIntegrity).not.toHaveBeenCalled();
    expect(detailsShare).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('diag-btn-share-details'));
    await waitFor(() => expect(detailsShare).toHaveBeenCalledTimes(1));
    const sent = detailsShare.mock.calls[0][1];
    expect(sent).toContain('SQLITE_CORRUPT');
    expect(sent).toContain('MIGRATION_FAILED');
    expect(sent).toContain('ENOSPC');
  });

  it('reports broken links in plain words without database jargon or match ids', async () => {
    const ids = ['3c9d6a10-2222-4a4a-9b9b-000000000001', '3c9d6a10-2222-4a4a-9b9b-000000000002'];
    useFakeAppStore.setState({ checkIntegrity: jest.fn(async () => integrityReport({ foreignKeyViolations: 3, matchesNeedingRepair: ids })) });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    const result = await screen.findByTestId('diag-text-fk-result');
    expect(result).toHaveTextContent(/3 broken links/);
    expect(screen.queryByTestId('diag-text-pragmas')).not.toBeOnTheScreen();
    const shown = textsIn(screen.getByTestId('screen-diagnostics')).join(' ');
    expect(shown).not.toMatch(/foreign[ _]?key|pragma|violation|constraint|sqlite/i);
    for (const id of ids) {
      expect(shown).not.toContain(id);
    }
    expect(screen.getByTestId('diag-row-repair-2')).toBeOnTheScreen();
  });

  it('runs one data-link check when the button is tapped twice', async () => {
    let finish: () => void = () => undefined;
    const checkIntegrity = jest.fn(
      () =>
        new Promise<ReturnType<typeof integrityReport> | null>((resolve) => {
          finish = () => resolve(integrityReport());
        }),
    );
    useFakeAppStore.setState({ checkIntegrity });
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    await user.press(screen.getByTestId('diag-btn-fk-check'));
    expect(checkIntegrity).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(await screen.findByTestId('diag-text-fk-result')).toBeOnTheScreen();
  });

  it('shows the database pragmas the failure tests read behind a disclosure (AC-E1-02, FR-02b, E2E §3.7 diag-text-pragmas)', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<DiagnosticsScreen />);
    expect(screen.queryByTestId('diag-text-pragmas')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('diag-btn-technical'));
    expect(screen.getByTestId('diag-text-pragmas')).toHaveTextContent(/foreign_keys=1.*journal_mode=wal.*synchronous=2/);
  });

  it('labels every diagnostics control and keeps it at least 44 pt', async () => {
    useFakeAppStore.setState({ report: bootstrapReport({ integrityIssues: [{ matchId: 'match-9', message: 'Lions v Tigers needs repair.' }] }) });
    await renderWithTheme(<DiagnosticsScreen />);
    const controls = screen.getAllByRole('button');
    expect(controls.length).toBeGreaterThanOrEqual(4);
    expectAccessibleTargets(controls);
  });
});
