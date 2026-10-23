import '@/ui/testing';
import { screen, userEvent } from '@testing-library/react-native';
import { BUILTIN_FORMAT_PRESETS } from '@/domain/scoring';
import { GUTTERS, SHEET_GUTTER, lightColors } from '@/ui';
import { renderWithTheme, touchTargetSize, withWindow } from '@/ui/testing';
import { AppearanceSection } from '../components/AppearanceSection';
import { ImportPreviewAction, ImportPreviewView } from '../components/ImportPreviewView';
import { InfoLine, InfoRow, stacksValue } from '../components/InfoRow';
import { SegmentSetting } from '../components/SegmentSetting';
import { presetDetail, presetRows } from '../selectors/presets';
import { selectImportPreview } from '../selectors/importPreview';
import { THEME_CHOICES } from '../selectors/settings';
import { DefaultFormatSheet } from '../sheets/DefaultFormatSheet';
import { PresetDetailSheet } from '../sheets/PresetDetailSheet';
import { conflict, importPreview, issue } from './support/fixtures';

interface Node {
  readonly props: { readonly style?: unknown };
  readonly parent: Node | null;
}

function paddingOf(node: Node): number | undefined {
  const flat = [node.props.style].flat(Infinity as 1).filter(Boolean) as Record<string, unknown>[];
  const found = flat.reverse().find((entry) => typeof entry.paddingHorizontal === 'number');
  return found ? (found.paddingHorizontal as number) : undefined;
}

function radioGroups(label: string): number {
  return screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === label).length;
}

function gutterAround(node: Node): number | undefined {
  for (let current = node.parent; current !== null; current = current.parent) {
    const padding = paddingOf(current);
    if (padding !== undefined) {
      return padding;
    }
  }
  return undefined;
}

describe('DefaultFormatSheet', () => {
  it('lists the presets as one radio group with the default checked, using the shared choice rows', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<DefaultFormatSheet visible presets={presetRows(BUILTIN_FORMAT_PRESETS, 'T20')} onSelect={onSelect} onClose={jest.fn()} />);
    expect(radioGroups('Default format')).toBeGreaterThan(0);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(BUILTIN_FORMAT_PRESETS.length);
    expect(screen.getByTestId('format-chip-t20')).toBeChecked();
    expect(screen.getByTestId('format-chip-t20-mark', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox')).not.toBeOnTheScreen();
    for (const radio of radios) {
      expect(touchTargetSize(radio).height).toBeGreaterThanOrEqual(56);
    }
    await user.press(screen.getByTestId('format-chip-t20'));
    expect(onSelect).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('format-chip-t10'));
    expect(onSelect).toHaveBeenCalledWith('T10');
  });

  it('has a title and the choices only, no explanatory subtitle', async () => {
    await renderWithTheme(<DefaultFormatSheet visible presets={presetRows(BUILTIN_FORMAT_PRESETS, 'T20')} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Default format' })).toBeOnTheScreen();
    expect(screen.queryByText(/You can still change any rule/)).not.toBeOnTheScreen();
  });
});

describe('SegmentSetting', () => {
  it('renders a labelled radio group with one segment per choice and no helper text', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<SegmentSetting title="Theme" choices={THEME_CHOICES} value="light" onChange={onChange} testID="group" />);
    expect(screen.getByTestId('group')).toHaveAccessibleName('Theme');
    expect(screen.getByText('Theme')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.press(screen.getByTestId('settings-chip-theme-system'));
    expect(onChange).toHaveBeenCalledWith('system');
  });

  it.each([
    [320, GUTTERS['compact-s']],
    [390, GUTTERS.compact],
    [820, GUTTERS.expanded],
  ])('lines its title up with the list rows at %i wide (gutter %i)', async (width, gutter) => {
    await withWindow({ width, height: 844 }, async () => {
      await renderWithTheme(<SegmentSetting title="Theme" choices={THEME_CHOICES} value="light" onChange={jest.fn()} testID="group" />);
      expect(gutterAround(screen.getByText('Theme') as unknown as Node)).toBe(gutter);
    });
  });
});

describe('InfoRow', () => {
  it('reads a value row as one element and exposes the value for E2E', async () => {
    await renderWithTheme(<InfoRow label="Database version" value="1" valueTestID="value" />);
    expect(screen.getByLabelText('Database version, 1')).toBeOnTheScreen();
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('puts a long value under its label, left-aligned, instead of a ragged right column', async () => {
    const view = await renderWithTheme(<InfoRow label="No-balls" value="1 run penalty, bowled again, free hit" valueTestID="value" />);
    expect(stacksValue('1 run penalty, bowled again, free hit')).toBe(true);
    expect(screen.getByTestId('value')).not.toHaveStyle({ textAlign: 'right' });
    expect(screen.getByLabelText('No-balls, 1 run penalty, bowled again, free hit')).toBeOnTheScreen();
    await view.rerender(<InfoRow label="Wides" value="Not allowed" valueTestID="value" />);
    expect(stacksValue('Not allowed')).toBe(false);
    expect(screen.getByTestId('value')).toHaveStyle({ textAlign: 'right' });
  });

  it('never truncates the value', async () => {
    await renderWithTheme(<InfoRow label="Super over" value="1 over, 2 wickets; if tied again, another super over" valueTestID="value" />);
    expect(screen.getByTestId('value').props.numberOfLines).toBeUndefined();
  });

  it('spans the sheet edge to edge like a list row and keeps its text on the sheet gutter', async () => {
    const t20 = BUILTIN_FORMAT_PRESETS.find((preset) => preset.id === 'T20');
    if (!t20) {
      throw new Error('T20 preset missing');
    }
    await renderWithTheme(<PresetDetailSheet visible preset={presetDetail(t20, 'T20')} busy={false} onMakeDefault={jest.fn()} onClose={jest.fn()} />);
    const row = screen.getByLabelText('Overs per innings, 20');
    expect(row).toHaveStyle({ paddingHorizontal: SHEET_GUTTER });
    const margins: number[] = [];
    for (let current: Node | null = row as unknown as Node; current !== null; current = current.parent) {
      const flat = [current.props.style].flat(Infinity as 1).filter(Boolean) as Record<string, unknown>[];
      const margin = flat.find((entry) => typeof entry.marginHorizontal === 'number');
      if (margin) {
        margins.push(margin.marginHorizontal as number);
      }
    }
    expect(margins).toContain(-SHEET_GUTTER);
  });
});

describe('InfoLine', () => {
  it('reads as one element without adding its own gutter, and stacks long values under the label', async () => {
    const view = await renderWithTheme(<InfoLine label="Scoring engine" value="2" valueTestID="value" />);
    const line = screen.getByLabelText('Scoring engine, 2');
    expect(line).not.toHaveStyle({ paddingHorizontal: expect.any(Number) });
    expect(screen.getByTestId('value')).toHaveStyle({ textAlign: 'right' });
    await view.rerender(<InfoLine label="Database settings" value="foreign_keys=1 journal_mode=wal synchronous=2" valueTestID="value" />);
    expect(screen.getByTestId('value')).not.toHaveStyle({ textAlign: 'right' });
    expect(screen.getByTestId('value').props.numberOfLines).toBeUndefined();
    expect(screen.getByLabelText('Database settings, foreign_keys=1 journal_mode=wal synchronous=2')).toBeOnTheScreen();
  });
});

describe('ImportPreviewView', () => {
  it('uses one radio group for the import policy and disables it while importing', async () => {
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), 'city-cup.json');
    await renderWithTheme(
      <>
        <ImportPreviewView vm={vm} policy="skip_existing" busy onPolicyChange={jest.fn()} />
        <ImportPreviewAction vm={vm} busy onImport={jest.fn()} />
      </>,
    );
    expect(radioGroups('If items already exist')).toBeGreaterThan(0);
    expect(screen.getByTestId('import-chip-policy-skip')).toBeChecked();
    expect(screen.getByTestId('import-chip-policy-copy')).toBeDisabled();
    expect(screen.getByTestId('import-btn-apply')).toBeBusy();
  });

  it('selects another policy once and never re-selects the current one', async () => {
    const onPolicyChange = jest.fn();
    const user = userEvent.setup();
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), null);
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={onPolicyChange} />);
    await user.press(screen.getByTestId('import-chip-policy-skip'));
    expect(onPolicyChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('radio', { name: /^Import as a copy/ }));
    expect(onPolicyChange).toHaveBeenCalledWith('import_as_copy');
  });

  it('marks a destructive replace with an icon and danger text, not colour alone', async () => {
    const vm = selectImportPreview(importPreview({ conflicts: [conflict({ localOnly: { matches: 3, events: 0 } })] }), null);
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByText('3 matches recorded only on this phone will be lost')).toHaveStyle({ color: lightColors.danger });
    expect(screen.getAllByTestId('lucide-triangle-alert', { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a replace consequence without danger styling when nothing local would be lost', async () => {
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), null);
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByText("Uses the file's version")).toHaveStyle({ color: lightColors.textSecondary });
    expect(screen.queryByTestId('lucide-triangle-alert', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('groups problems and warnings under their own headers without repeating the severity on every row', async () => {
    const warnings = selectImportPreview(importPreview({ issues: [issue('warning', 'CHECKSUM_MISSING', 'No checksum.')] }), null);
    const view = await renderWithTheme(<ImportPreviewView vm={warnings} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Warnings' })).toBeOnTheScreen();
    expect(screen.queryByText('Warning')).not.toBeOnTheScreen();
    expect(screen.getByTestId('import-row-issue-1')).toHaveAccessibleName('Warning: No checksum.');
    expect(warnings.importable).toBe(true);
    const errors = selectImportPreview(
      importPreview({ ok: false, issues: [issue('warning', 'CHECKSUM_MISSING', 'No checksum.'), issue('error', 'INVALID_JSON', 'Not a backup.')] }),
      null,
    );
    await view.rerender(<ImportPreviewView vm={errors} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Problems' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Warnings' })).toBeOnTheScreen();
    expect(screen.getByTestId('import-row-issue-1')).toHaveAccessibleName('Problem: Not a backup.');
    expect(screen.getByTestId('import-row-issue-2')).toHaveAccessibleName('Warning: No checksum.');
    expect(errors.importable).toBe(false);
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
  });

  it('shows a long issue as a short headline with one supporting line', async () => {
    const vm = selectImportPreview(
      importPreview({ ok: false, issues: [issue('error', 'UNSUPPORTED_FORMAT_VERSION', 'This backup was made by a newer version of Scorebook. Update the app, then import it again.')] }),
      null,
    );
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByText('This backup was made by a newer version of Scorebook')).toBeOnTheScreen();
    expect(screen.getByText('Update the app, then import it again.')).toBeOnTheScreen();
    expect(screen.getByTestId('import-row-issue-1')).toHaveAccessibleName(
      'Problem: This backup was made by a newer version of Scorebook. Update the app, then import it again.',
    );
    expect(screen.getByTestId('import-text-summary')).toHaveTextContent("This file can't be imported", { exact: true });
  });

  it('shows the file identity without format or schema version numbers', async () => {
    const vm = selectImportPreview(importPreview(), 'city-cup.json');
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByTestId('import-text-file')).toHaveTextContent('city-cup.json');
    expect(screen.queryByText(/Backup format|data version/)).not.toBeOnTheScreen();
  });

  it('labels the docked import action by whether a policy applies', async () => {
    const onImport = jest.fn();
    const user = userEvent.setup();
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), null);
    await renderWithTheme(<ImportPreviewAction vm={vm} busy={false} onImport={onImport} />);
    const button = screen.getByTestId('import-btn-apply');
    expect(button).toHaveProp('accessibilityHint', 'Imports the file using the option chosen above');
    await user.press(button);
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe('AppearanceSection (§106 reduce transparency)', () => {
  it('shows the setting as title, one short helper and the switch, with no explanatory paragraph', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<AppearanceSection theme="system" onThemeChange={jest.fn()} reduceTransparency={false} onReduceTransparencyChange={onChange} />);
    expect(screen.getByText('Reduce transparency')).toBeOnTheScreen();
    expect(screen.getByText('Use solid backgrounds instead of glass effects.')).toBeOnTheScreen();
    expect(screen.queryByText(/tab bar|frosted|Scores and tables/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/System follows/)).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('settings-toggle-transparency'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows the switch on and locked while the phone's Reduce Transparency already makes glass solid", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <AppearanceSection theme="system" onThemeChange={jest.fn()} reduceTransparency={false} systemReduceTransparency onReduceTransparencyChange={onChange} />,
    );
    const row = screen.getByTestId('settings-toggle-transparency');
    expect(row).toBeChecked();
    expect(row).toBeDisabled();
    expect(row).toHaveAccessibleName("Reduce transparency, On in your phone's settings.");
    await user.press(row);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides the switch when the setting is not wired', async () => {
    await renderWithTheme(<AppearanceSection theme="light" onThemeChange={jest.fn()} />);
    expect(screen.queryByTestId('settings-toggle-transparency')).not.toBeOnTheScreen();
  });
});
