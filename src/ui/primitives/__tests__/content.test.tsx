import '../../testing';
import { Share } from 'react-native';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { darkColors, lightColors } from '../../theme';
import { Badge, Banner, EmptyState, ErrorState, ListRow, SKELETON_DELAY_MS, Skeleton, Table, type TableColumn } from '..';

interface StandingVM {
  readonly key: string;
  readonly position: string;
  readonly team: string;
  readonly played: number;
  readonly points: number;
  readonly nrr: string;
  readonly own: boolean;
}

const ROWS: readonly StandingVM[] = [
  { key: 'tig', position: '1', team: 'Tigers', played: 3, points: 6, nrr: '+1.234', own: false },
  { key: 'lio', position: '2', team: 'Lions', played: 3, points: 4, nrr: '+0.210', own: true },
];

const COLUMNS: readonly TableColumn<StandingVM>[] = [
  { key: 'team', header: 'Team', kind: 'name', value: (row) => row.team, subtext: (row) => (row.own ? 'Your team' : null) },
  { key: 'p', header: 'P', kind: 'numeric', value: (row) => String(row.played) },
  { key: 'pts', header: 'Pts', kind: 'numeric', width: 40, value: (row) => String(row.points) },
  { key: 'nrr', header: 'NRR', kind: 'numeric', width: 64, value: (row) => row.nrr },
];

const label = (row: StandingVM) => `Position ${row.position}, ${row.team}, played ${row.played}, ${row.points} points, net run rate ${row.nrr}`;

describe('ListRow', () => {
  it('is one accessible button combining title, subtitle and value', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <ListRow title="Default format" subtitle="Used for new matches" trailing={{ kind: 'value', text: 'T20', chevron: true }} onPress={onPress} testID="settings-row-format" />,
    );
    const row = screen.getByRole('button', { name: 'Default format, Used for new matches, T20' });
    expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(56);
    await user.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns into a switch row that toggles from anywhere on the row', async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<ListRow title="Vibration" trailing={{ kind: 'switch', value: true, onValueChange }} />);
    const row = screen.getByRole('switch', { name: 'Vibration' });
    expect(row).toBeChecked();
    expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(48);
    await user.press(row);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('keeps the trailing menu as its own labelled button', async () => {
    const onMenu = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <ListRow title="Lions v Tigers" leading={{ monogram: 'LT' }} onPress={jest.fn()} menu={{ accessibilityLabel: 'More actions for Lions v Tigers', onPress: onMenu }} />,
    );
    await user.press(screen.getByRole('button', { name: 'More actions for Lions v Tigers' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('draws the 2 pt focus ring inside the full-bleed row so the next row never covers it', async () => {
    await renderWithTheme(<ListRow title="Teams" trailing={{ kind: 'chevron' }} onPress={jest.fn()} />);
    const row = () => screen.getByRole('button', { name: 'Teams' });
    expect(row()).not.toHaveStyle({ outlineColor: lightColors.focusRing });
    await fireEvent(row(), 'focus');
    expect(row()).toHaveStyle({ outlineColor: lightColors.focusRing, outlineWidth: 2, outlineOffset: -2 });
    await fireEvent(row(), 'blur');
    expect(row()).not.toHaveStyle({ outlineColor: lightColors.focusRing });
  });

  it('renders as plain text without a press handler', async () => {
    await renderWithTheme(<ListRow title="Scorebook 1.0.0" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.getByText('Scorebook 1.0.0')).toBeOnTheScreen();
  });
});

describe('Table', () => {
  it('exposes one accessible element per row and hides the header cells', async () => {
    await renderWithTheme(
      <Table columns={COLUMNS} rows={ROWS} rowKey={(row) => row.key} rowAccessibilityLabel={label} rowTestID={(_, i) => `standings-row-a-${i + 1}`} />,
    );
    expect(screen.getByLabelText(label(ROWS[0]))).toBeOnTheScreen();
    expect(screen.getByTestId('standings-row-a-2')).toHaveProp('accessibilityLabel', label(ROWS[1]));
    expect(screen.queryByText('NRR')).not.toBeOnTheScreen();
    expect(screen.getByText('NRR', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('right-aligns tabular numbers and left-aligns names', async () => {
    await renderWithTheme(<Table columns={COLUMNS} rows={ROWS} rowKey={(row) => row.key} rowAccessibilityLabel={label} />);
    expect(screen.getByText('+1.234', { includeHiddenElements: true })).toHaveStyle({ textAlign: 'right', fontVariant: ['tabular-nums'] });
    expect(screen.getByText('Tigers', { includeHiddenElements: true })).toHaveStyle({ textAlign: 'left' });
    expect(screen.getByText('Your team', { includeHiddenElements: true })).toHaveStyle({ color: lightColors.textSecondary });
  });

  it('emphasises a row with a tint, a leading bar and a marker, never colour alone', async () => {
    await renderWithTheme(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={label}
        rowTestID={(_, i) => `row-${i}`}
        emphasis={(row) => (row.own ? { marker: 'striker' } : null)}
      />,
    );
    const own = screen.getByTestId('row-1');
    expect(own).toHaveStyle({ backgroundColor: lightColors.accentSubtle });
    expect(screen.getByTestId('row-0')).toHaveStyle({ backgroundColor: lightColors.surface });
    expect(screen.getByText('Lions', { includeHiddenElements: true })).toHaveStyle({ fontFamily: 'Inter_600SemiBold' });
  });

  it('uses taller rows when rows are tappable and reports presses', async () => {
    const onRowPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<Table columns={COLUMNS} rows={ROWS} rowKey={(row) => row.key} rowAccessibilityLabel={label} onRowPress={onRowPress} />);
    const row = screen.getByRole('button', { name: label(ROWS[1]) });
    expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(48);
    await user.press(row);
    expect(onRowPress).toHaveBeenCalledWith(ROWS[1], 1);
  });

  it('rings only the focused tappable row and keeps one keyboard stop per row when the numbers scroll', async () => {
    const view = await renderWithTheme(
      <Table columns={COLUMNS} rows={ROWS} rowKey={(row) => row.key} rowAccessibilityLabel={label} onRowPress={jest.fn()} scrollable />,
      { mode: 'dark' },
    );
    await fireEvent(screen.getByRole('button', { name: label(ROWS[0]) }), 'focus');
    expect(screen.getByRole('button', { name: label(ROWS[0]) })).toHaveStyle({ outlineColor: darkColors.focusRing, outlineWidth: 2 });
    expect(screen.getByRole('button', { name: label(ROWS[1]) })).not.toHaveStyle({ outlineColor: darkColors.focusRing });
    const stops = view.container.queryAll((node) => typeof node.type === 'string' && node.props.focusable === true);
    expect(stops).toHaveLength(ROWS.length);
  });

  it('shows a single muted line when empty', async () => {
    await renderWithTheme(<Table columns={COLUMNS} rows={[]} rowKey={(row) => row.key} rowAccessibilityLabel={label} />);
    expect(screen.getByText('No matches played yet')).toHaveStyle({ color: lightColors.textMuted });
  });

  it('keeps the first column fixed while the numbers scroll', async () => {
    await renderWithTheme(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.key}
        rowAccessibilityLabel={label}
        scrollable
        totals={{ cells: { team: 'Total', pts: '10' }, accessibilityLabel: 'Total, 10 points', ruled: true, testID: 'totals' }}
      />,
    );
    expect(screen.getAllByLabelText(label(ROWS[0]))).toHaveLength(1);
    expect(screen.getByTestId('totals')).toHaveProp('accessibilityLabel', 'Total, 10 points');
    expect(screen.getByText('+0.210', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it('always carries text and uses the qualified tokens', async () => {
    await renderWithTheme(<Badge label="Qualified" tone="qualified" testID="badge-q" />);
    const badge = screen.getByLabelText('Qualified');
    expect(badge).toHaveStyle({ backgroundColor: lightColors.successSubtle, height: 24, borderRadius: 2 });
    expect(screen.getByText('Qualified', { includeHiddenElements: true })).toHaveStyle({ color: lightColors.success });
    expect(screen.getByTestId('lucide-check')).toBeOnTheScreen();
  });

  it('marks a manual override with the warning tokens and a pencil', async () => {
    await renderWithTheme(<Badge label="Manual Override" tone="override" />, { mode: 'dark' });
    expect(screen.getByLabelText('Manual Override')).toHaveStyle({ backgroundColor: darkColors.warningSubtle });
    expect(screen.getByTestId('lucide-pencil-line')).toBeOnTheScreen();
  });

  it('shows provisional with a dashed outline and live with a static dot', async () => {
    await renderWithTheme(
      <>
        <Badge label="Provisional" tone="provisional" />
        <Badge label="Live" tone="live" />
      </>,
    );
    expect(screen.getByLabelText('Provisional')).toHaveStyle({ borderStyle: 'dashed', borderWidth: 1 });
    expect(screen.getByLabelText('Live')).toHaveStyle({ backgroundColor: lightColors.accentSubtle });
  });
});

describe('EmptyState and ErrorState', () => {
  it('shows purposeful copy with one primary action', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <EmptyState
        title="No tournaments yet"
        body="Create a tournament and manage teams, fixtures, standings and finals in one place."
        action={{ label: 'CREATE TOURNAMENT', onPress, testID: 'tournaments-btn-create' }}
        caps
      />,
    );
    expect(screen.getByRole('header', { name: 'No tournaments yet' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'CREATE TOURNAMENT' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('never shows raw errors: human copy, retry, and technical details shared out of the app, never rendered', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    try {
      const onRetry = jest.fn();
      const user = userEvent.setup();
      await renderWithTheme(<ErrorState title="Couldn't load this tournament" onRetry={onRetry} details="SQLITE_BUSY: database is locked" />);
      expect(screen.getByTestId('error-screen')).toBeOnTheScreen();
      expect(screen.getByTestId('error-text-message')).toHaveTextContent('Your data is safe on this device.', { exact: true });
      expect(screen.queryByText(/SQLITE_BUSY/, { includeHiddenElements: true })).toBeNull();
      await user.press(screen.getByTestId('error-btn-retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
      const shareButton = screen.getByRole('button', { name: 'Share technical details' });
      expect(touchTargetSize(shareButton).height).toBeGreaterThanOrEqual(44);
      await user.press(shareButton);
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0]).toEqual(expect.objectContaining({ message: 'SQLITE_BUSY: database is locked' }));
      expect(screen.queryByText(/SQLITE_BUSY/, { includeHiddenElements: true })).toBeNull();
    } finally {
      share.mockRestore();
    }
  });

  it('survives a share sheet that fails or is unavailable without surfacing the raw detail', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('ShareModule unavailable'));
    try {
      const user = userEvent.setup();
      await renderWithTheme(<ErrorState title="Couldn't load this tournament" onRetry={jest.fn()} details="SQLITE_BUSY: database is locked" />);
      await user.press(screen.getByRole('button', { name: 'Share technical details' }));
      expect(share).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('error-screen')).toBeOnTheScreen();
      expect(screen.queryByText(/SQLITE_BUSY|ShareModule/, { includeHiddenElements: true })).toBeNull();
    } finally {
      share.mockRestore();
    }
  });

  it('offers no technical-details action when there is no detail', async () => {
    await renderWithTheme(<ErrorState title="Couldn't load this tournament" onRetry={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Share technical details' })).toBeNull();
  });
});

describe('Banner', () => {
  it('uses a subtle background, a leading bar, an icon and text', async () => {
    await renderWithTheme(<Banner tone="danger" message="This match needs repair" action={{ label: 'Open ball log', onPress: jest.fn() }} testID="score-banner-repair" />);
    const banner = screen.getByTestId('score-banner-repair');
    expect(banner).toHaveStyle({ backgroundColor: lightColors.dangerSubtle });
    expect(banner).toHaveProp('accessibilityRole', 'alert');
    expect(screen.getByTestId('lucide-circle-alert')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open ball log' })).toBeOnTheScreen();
  });
});

describe('Skeleton', () => {
  it('waits 300 ms before appearing and is announced once as loading', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<Skeleton rows={2} testID="history-skeleton" />);
      const container = screen.getByTestId('history-skeleton');
      expect(container).toHaveProp('accessibilityLabel', 'Loading');
      expect(container).toBeBusy();
      expect(container.children).toHaveLength(0);
      await act(async () => {
        jest.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(screen.getByTestId('history-skeleton').children).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('pulses with motion and stays static with reduced motion', async () => {
    jest.useFakeTimers();
    try {
      const moving = await renderWithTheme(<Skeleton rows={1} delayMs={0} testID="pulse" />);
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      const pulsing = screen.getByTestId('pulse').children[0] as { props: Record<string, unknown> };
      expect(Number(getAnimatedStyle(pulsing).opacity)).toBeLessThan(1);
      await moving.unmount();
      await renderWithTheme(<Skeleton rows={1} delayMs={0} testID="static" />, { reducedMotion: 'on' });
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      const still = screen.getByTestId('static').children[0] as { props: Record<string, unknown> };
      expect(getAnimatedStyle(still).opacity).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
