import '@/ui/testing';
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ImportPreview } from '@/domain/types';
import { renderWithTheme } from '@/ui/testing';
import { pickBackupFile } from '../platform/backupFile';
import { BackupScreen } from '../screens/BackupScreen';
import {
  BACKUP_URI,
  PICKED_URI,
  conflict,
  importPreview,
  importReport,
  importSource,
  issue,
  serviceError,
  tournamentItem,
} from './support/fixtures';
import {
  resetFakeStores,
  useFakeBackupStore,
  useFakeExportStore,
  useFakeSettingsStore,
  useFakeTournamentListStore,
} from './support/fakeStores';
import { mockRouter, resetRouter } from './support/router';

jest.mock('@/stores', () => jest.requireActual('./support/fakeStores').fakeStoresModule);
jest.mock('expo-router', () => jest.requireActual('./support/router').routerModule);
jest.mock('../platform/backupFile', () => ({ pickBackupFile: jest.fn() }));

const picker = jest.mocked(pickBackupFile);

beforeEach(() => {
  resetFakeStores();
  resetRouter();
  picker.mockReset();
  picker.mockResolvedValue({ uri: PICKED_URI, name: 'city-cup.json' });
});

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

describe('BackupScreen export (W-X1, §84)', () => {
  it('exports everything and opens the share sheet with the JSON file', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    expect(screen.getByTestId('screen-backup')).toBeOnTheScreen();
    await user.press(screen.getByTestId('backup-btn-export-full'));
    expect(useFakeBackupStore.getState().exportBackup).toHaveBeenCalledWith({ kind: 'full' });
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledWith(BACKUP_URI, 'application/json'));
    expect(await screen.findByTestId('backup-text-exported')).toHaveTextContent('Saved as scorebook-backup-2026-09-30.json');
    await user.press(screen.getByTestId('backup-btn-share'));
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledTimes(2));
  });

  it('shows the store message when the backup cannot be written and does not share', async () => {
    useFakeBackupStore.setState({
      exportBackup: jest.fn(async () => {
        useFakeBackupStore.setState({ error: serviceError({ code: 'EXPORT_FAILED', detail: 'ENOSPC' }) });
        return null;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-full'));
    const banner = await screen.findByTestId('backup-banner-export-error');
    expect(banner).toHaveTextContent("Couldn't save the backup. Your data is safe.");
    expect(screen.queryByText(/ENOSPC/)).not.toBeOnTheScreen();
    expect(useFakeExportStore.getState().share).not.toHaveBeenCalled();
  });

  it('keeps the saved file and explains when sharing fails', async () => {
    useFakeExportStore.setState({ share: jest.fn(async () => false) });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-full'));
    expect(await screen.findByTestId('backup-banner-export-error')).toHaveTextContent(
      "Couldn't open the share sheet. The backup is saved, so you can try sharing it again.",
    );
    expect(screen.getByTestId('backup-text-exported')).toBeOnTheScreen();
  });

  it('exports one tournament picked from the tournaments list', async () => {
    useFakeTournamentListStore.setState({ items: [tournamentItem(), tournamentItem({ id: 'tour-2', name: 'Spring Cup', season: null })] });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-tournament'));
    expect(useFakeTournamentListStore.getState().load).toHaveBeenCalledTimes(1);
    const sheet = screen.getByTestId('sheet-backup-tournament');
    expect(within(sheet).getByText('City Cup')).toBeOnTheScreen();
    await user.press(screen.getByTestId('backup-row-tournament-2'));
    expect(useFakeBackupStore.getState().exportBackup).toHaveBeenCalledWith({ kind: 'tournament', tournamentId: 'tour-2' });
    await waitFor(() => expect(useFakeExportStore.getState().share).toHaveBeenCalledWith(BACKUP_URI, 'application/json'));
  });

  it('shows a purposeful empty state when there is no tournament to export (§87)', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-tournament'));
    expect(await screen.findByTestId('backup-text-no-tournaments')).toBeOnTheScreen();
  });

  it('says it is loading until the tournaments arrive', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    useFakeTournamentListStore.setState({ load: jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve))) });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-tournament'));
    expect(screen.getByTestId('backup-text-tournaments-loading')).toBeOnTheScreen();
    await act(async () => {
      useFakeTournamentListStore.setState({ items: [tournamentItem()] });
      finish(true);
    });
    expect(screen.getByTestId('backup-row-tournament-1')).toBeOnTheScreen();
  });

  it('offers a retry when the tournaments cannot be loaded', async () => {
    const load = jest.fn(async () => false);
    useFakeTournamentListStore.setState({ load });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-export-tournament'));
    expect(await screen.findByTestId('backup-banner-tournaments-error')).toHaveTextContent("Couldn't load your tournaments. Your data is safe.", { exact: false });
    expect(screen.queryByTestId('backup-text-no-tournaments')).not.toBeOnTheScreen();
    load.mockResolvedValue(true);
    await user.press(screen.getByTestId('backup-btn-tournaments-retry'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('backup-text-no-tournaments')).toBeOnTheScreen();
  });

  it('goes back with the header button', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe('BackupScreen import (W-X1, §84, BACKUP_RESTORE §10)', () => {
  it('picks a file, validates it without writing and shows counts and versions', async () => {
    previewWith(importPreview({ source: importSource() }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(picker).toHaveBeenCalledTimes(1);
    expect(useFakeBackupStore.getState().previewImport).toHaveBeenCalledWith(PICKED_URI);
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    expect(screen.getByTestId('import-text-file')).toHaveTextContent('city-cup.json');
    expect(screen.getByTestId('import-text-scope')).toHaveTextContent('Tournament backup · Exported 28 Sep 2026 from Scorebook 1.0.0 on Android');
    expect(screen.getByTestId('import-text-versions')).toHaveTextContent('Backup format 1 · data version 1');
    expect(screen.getByTestId('import-text-summary')).toHaveTextContent('File is valid · 1 tournament, 24 matches');
    expect(screen.getByTestId('import-text-count-matches')).toHaveTextContent('24');
    expect(screen.getByTestId('import-text-count-matchEvents')).toHaveTextContent('4,210');
    expect(screen.queryByTestId('import-chip-policy-skip')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose another file…, Nothing changes until you review the file and tap Import' })).toBeOnTheScreen();
  });

  it('does nothing when the picker is cancelled', async () => {
    picker.mockResolvedValue(null);
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-import'));
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(useFakeBackupStore.getState().previewImport).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-group-preview')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('import-banner-error')).not.toBeOnTheScreen();
  });

  it('explains when the file picker cannot open', async () => {
    picker.mockRejectedValue(new Error('E_PICKER_BUSY'));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-import'));
    expect(await screen.findByTestId('import-banner-error')).toHaveTextContent("Couldn't open the file picker. Try again.");
    expect(screen.queryByText(/E_PICKER_BUSY/)).not.toBeOnTheScreen();
  });

  it('explains when the file cannot be read at all', async () => {
    useFakeBackupStore.setState({
      previewImport: jest.fn(async () => {
        useFakeBackupStore.setState({ error: serviceError({ code: 'IMPORT_INVALID', message: "Couldn't read this file.", detail: 'EACCES' }) });
        return false;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await user.press(screen.getByTestId('backup-btn-import'));
    expect(await screen.findByTestId('import-banner-error')).toHaveTextContent("Couldn't read this file.");
    expect(screen.queryByText(/EACCES/)).not.toBeOnTheScreen();
  });

  it('lists the problems of an invalid file, errors first, and hides Import (E2E-14)', async () => {
    previewWith(
      importPreview({
        ok: false,
        issues: [
          issue('warning', 'CHECKSUM_MISSING', 'This file has no checksum.'),
          issue('error', 'UNSUPPORTED_FORMAT_VERSION', 'This backup uses a format this version of Scorebook cannot read.'),
        ],
      }),
    );
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-text-summary')).toHaveTextContent("This file can't be imported. Nothing on this phone was changed.");
    expect(screen.getByTestId('import-row-issue-1')).toHaveAccessibleName('Problem: This backup uses a format this version of Scorebook cannot read.');
    expect(screen.getByTestId('import-row-issue-2')).toHaveAccessibleName('Warning: This file has no checksum.');
    expect(screen.queryByText('data.matches[0]')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
  });

  it('docks the import and done actions in the glass footer and keeps the header in the glass bar (§106)', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    expect(within(screen.getByTestId('screen-backup-header')).getByRole('header', { name: 'Backup & import' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-backup-header')).getByTestId('nav-btn-back')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-backup-scroll')).getByTestId('backup-text-intro')).toHaveTextContent('Backups are files you keep. Nothing is uploaded.');
    expect(screen.queryByTestId('screen-backup-footer')).not.toBeOnTheScreen();
    await chooseFile(user);
    expect(within(screen.getByTestId('screen-backup-footer')).getByTestId('import-btn-apply')).toBeOnTheScreen();
    expect(within(screen.getByTestId('import-group-preview')).queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(await screen.findByTestId('import-text-report')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-backup-footer')).getByTestId('import-btn-done')).toBeOnTheScreen();
    await user.press(screen.getByTestId('import-btn-done'));
    await waitFor(() => expect(screen.queryByTestId('screen-backup-footer')).not.toBeOnTheScreen());
  });

  it('imports a new file directly when nothing already exists', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'skip_existing');
    expect(await screen.findByTestId('import-text-report')).toHaveTextContent('Imported 1 tournament, 24 matches. Skipped 2 teams already on this phone.');
    expect(useFakeSettingsStore.getState().load).not.toHaveBeenCalled();
    expect(useFakeSettingsStore.getState().update).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-group-preview')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('import-btn-done'));
    expect(useFakeBackupStore.getState().reset).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('import-group-report')).not.toBeOnTheScreen());
  });

  it('flags a duplicate import and lists conflicts per aggregate with local-only data (E2E-12)', async () => {
    previewWith(
      importPreview({
        previouslyImportedAt: '2026-09-29T12:00:00.000Z',
        conflicts: [conflict({ localOnly: { matches: 3, events: 240 } }), conflict({ entity: 'team', id: 'team-1', label: 'Lions' })],
      }),
    );
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    expect(screen.getByTestId('import-text-previously-imported')).toHaveTextContent('Imported before on 29 Sep 2026');
    expect(screen.getByTestId('import-row-conflict-1')).toHaveAccessibleName(
      'Tournament City Cup 2026, 3 matches (240 scoring events) exist only on this phone',
    );
    expect(screen.getByTestId('import-row-conflict-2')).toHaveAccessibleName('Team Lions, Already in your library');
    expect(screen.getByTestId('import-chip-policy-skip')).toBeChecked();
    expect(screen.getByTestId('import-chip-policy-copy')).not.toBeChecked();
    expect(screen.getByTestId('import-chip-policy-replace')).toHaveAccessibleName('Replace mine, 3 matches recorded only on this phone will be lost');
  });

  it('skips existing items when asked and changes nothing local', async () => {
    previewWith(importPreview({ conflicts: [conflict()] }));
    useFakeBackupStore.setState({
      applyImport: jest.fn(async () => {
        useFakeBackupStore.setState({ report: importReport({ imported: {}, skipped: { tournament: 1 } }) });
        return true;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'skip_existing');
    expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen();
    expect(await screen.findByTestId('import-text-report')).toHaveTextContent(
      'Nothing new was imported. Everything in this file is already on this phone. Skipped 1 tournament already on this phone.',
    );
  });

  it('imports as a copy when that option is chosen', async () => {
    previewWith(importPreview({ conflicts: [conflict()] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-copy'));
    expect(screen.getByTestId('import-chip-policy-copy')).toBeChecked();
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'import_as_copy');
  });

  it('never replaces without an explicit confirmation that names the losses', async () => {
    previewWith(importPreview({ conflicts: [conflict({ localOnly: { matches: 3, events: 240 } })] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-replace'));
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog-import-replace')).toBeOnTheScreen();
    expect(screen.getByTestId('import-text-replace-message')).toHaveTextContent(
      "1 item on this phone will be replaced by the version in the file. 3 matches and 240 scoring events that exist only on this phone will be deleted. This can't be undone.",
    );
    await user.press(screen.getByTestId('import-btn-cancel-replace'));
    expect(useFakeBackupStore.getState().applyImport).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('dialog-import-replace')).not.toBeOnTheScreen());
    await user.press(screen.getByTestId('import-btn-apply'));
    await user.press(await screen.findByTestId('import-btn-confirm-replace'));
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledTimes(1);
    expect(useFakeBackupStore.getState().applyImport).toHaveBeenCalledWith(PICKED_URI, 'replace_existing');
  });

  it('keeps the preview and explains when the import fails', async () => {
    previewWith(importPreview({ conflicts: [conflict()] }));
    useFakeBackupStore.setState({
      applyImport: jest.fn(async () => {
        useFakeBackupStore.setState({ error: serviceError({ code: 'CONFLICT', message: 'The data changed while importing. Nothing was imported.' }) });
        return false;
      }),
    });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(await screen.findByTestId('import-banner-error')).toHaveTextContent('The data changed while importing. Nothing was imported.');
    expect(screen.getByTestId('import-group-preview')).toBeOnTheScreen();
    expect(useFakeSettingsStore.getState().load).not.toHaveBeenCalled();
  });

  it('falls back to a safe message when the store gives none', async () => {
    useFakeBackupStore.setState({ applyImport: jest.fn(async () => false) });
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-btn-apply'));
    expect(await screen.findByTestId('import-banner-error')).toHaveTextContent("Couldn't import this backup. Nothing on this phone was changed.");
  });

  it('starts a fresh preview when another file is chosen', async () => {
    previewWith(importPreview({ conflicts: [conflict()] }));
    const user = userEvent.setup();
    await renderWithTheme(<BackupScreen />);
    await chooseFile(user);
    await user.press(screen.getByTestId('import-chip-policy-copy'));
    picker.mockResolvedValue({ uri: 'file:///cache/other.json', name: 'other.json' });
    await user.press(screen.getByTestId('backup-btn-import'));
    await waitFor(() => expect(screen.getByTestId('import-text-file')).toHaveTextContent('other.json'));
    expect(useFakeBackupStore.getState().reset).toHaveBeenCalled();
    expect(screen.getByTestId('import-chip-policy-skip')).toBeChecked();
  });

  it('clears the backup store when the screen closes', async () => {
    const view = await renderWithTheme(<BackupScreen />);
    expect(useFakeBackupStore.getState().reset).not.toHaveBeenCalled();
    await view.unmount();
    expect(useFakeBackupStore.getState().reset).toHaveBeenCalledTimes(1);
  });
});
