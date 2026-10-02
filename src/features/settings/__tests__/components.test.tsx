import '@/ui/testing';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { darkColors, lightColors } from '@/ui';
import { renderWithTheme, touchTargetSize } from '@/ui/testing';
import { ChoiceRow } from '../components/ChoiceRow';
import { AppearanceSection } from '../components/AppearanceSection';
import { ImportPreviewAction, ImportPreviewView } from '../components/ImportPreviewView';
import { InfoRow } from '../components/InfoRow';
import { SegmentSetting } from '../components/SegmentSetting';
import { StackHeader, StackIntro } from '../components/StackHeader';
import { selectImportPreview } from '../selectors/importPreview';
import { THEME_CHOICES, transparencyNote } from '../selectors/settings';
import { conflict, importPreview, issue } from './support/fixtures';

describe('ChoiceRow', () => {
  it('is a labelled radio with a 56 pt target that selects once', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    const view = await renderWithTheme(<ChoiceRow title="Import as a copy" detail="Nothing on this phone changes" selected={false} onSelect={onSelect} testID="row" />);
    const row = screen.getByRole('radio', { name: 'Import as a copy, Nothing on this phone changes' });
    expect(row).not.toBeChecked();
    expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(56);
    await user.press(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    await view.rerender(<ChoiceRow title="Import as a copy" selected onSelect={onSelect} testID="row" />);
    expect(screen.getByTestId('row')).toBeChecked();
    await user.press(screen.getByTestId('row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('marks a destructive consequence with an icon and danger text, not colour alone', async () => {
    await renderWithTheme(<ChoiceRow title="Replace mine" detail="3 matches will be lost" destructive selected={false} onSelect={jest.fn()} />);
    expect(screen.getByTestId('lucide-triangle-alert')).toBeOnTheScreen();
    expect(screen.getByText('3 matches will be lost')).toHaveStyle({ color: lightColors.danger });
  });

  it('cannot be selected while disabled', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<ChoiceRow title="Skip them" selected={false} disabled onSelect={onSelect} testID="row" />);
    expect(screen.getByTestId('row')).toBeDisabled();
    await user.press(screen.getByTestId('row'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows a focus ring for keyboard and switch access', async () => {
    await renderWithTheme(<ChoiceRow title="Skip them" selected={false} onSelect={jest.fn()} testID="row" />, { mode: 'dark' });
    expect(screen.getByTestId('row')).not.toHaveStyle({ outlineColor: darkColors.focusRing });
    await fireEvent(screen.getByTestId('row'), 'focus');
    expect(screen.getByTestId('row')).toHaveStyle({ outlineColor: darkColors.focusRing, outlineWidth: 2 });
    await fireEvent(screen.getByTestId('row'), 'blur');
    expect(screen.getByTestId('row')).not.toHaveStyle({ outlineColor: darkColors.focusRing });
  });
});

describe('SegmentSetting', () => {
  it('renders a labelled radio group with one chip per choice', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<SegmentSetting title="Theme" helper="Follows your phone." choices={THEME_CHOICES} value="light" onChange={onChange} testID="group" />);
    expect(screen.getByTestId('group')).toHaveAccessibleName('Theme');
    expect(screen.getByText('Follows your phone.')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.press(screen.getByTestId('settings-chip-theme-system'));
    expect(onChange).toHaveBeenCalledWith('system');
  });
});

describe('InfoRow and StackHeader', () => {
  it('reads a value row as one element and exposes the value for E2E', async () => {
    await renderWithTheme(<InfoRow label="Database version" value="1" valueTestID="value" />);
    expect(screen.getByLabelText('Database version, 1')).toBeOnTheScreen();
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('offers a labelled back button and a header', async () => {
    const onBack = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <>
        <StackHeader title="Diagnostics" onBack={onBack} />
        <StackIntro text="For help." testID="intro" />
      </>,
    );
    expect(screen.getByRole('header', { name: 'Diagnostics' })).toBeOnTheScreen();
    expect(screen.getByTestId('intro')).toHaveTextContent('For help.');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(touchTargetSize(back).height).toBeGreaterThanOrEqual(44);
    await user.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('ImportPreviewView', () => {
  it('disables the policy choice and shows progress while importing', async () => {
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), 'city-cup.json');
    await renderWithTheme(
      <>
        <ImportPreviewView vm={vm} policy="skip_existing" busy onPolicyChange={jest.fn()} />
        <ImportPreviewAction vm={vm} busy onImport={jest.fn()} />
      </>,
    );
    expect(screen.getByTestId('import-chip-policy-copy')).toBeDisabled();
    expect(screen.getByTestId('import-btn-apply')).toBeBusy();
  });

  it('shows a replace consequence without danger styling when nothing local would be lost', async () => {
    const vm = selectImportPreview(importPreview({ conflicts: [conflict()] }), null);
    await renderWithTheme(<ImportPreviewView vm={vm} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByText("Items on this phone are replaced by the file's version")).toHaveStyle({ color: lightColors.textSecondary });
    expect(screen.queryByTestId('lucide-triangle-alert')).not.toBeOnTheScreen();
  });

  it('titles the issue list by whether the file can still be imported', async () => {
    const warnings = selectImportPreview(importPreview({ issues: [issue('warning', 'CHECKSUM_MISSING', 'No checksum.')] }), null);
    const view = await renderWithTheme(<ImportPreviewView vm={warnings} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Warnings' })).toBeOnTheScreen();
    expect(warnings.importable).toBe(true);
    const errors = selectImportPreview(importPreview({ ok: false, issues: [issue('error', 'INVALID_JSON', 'Not a backup.')] }), null);
    await view.rerender(<ImportPreviewView vm={errors} policy="skip_existing" busy={false} onPolicyChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Why this file cannot be imported' })).toBeOnTheScreen();
    expect(errors.importable).toBe(false);
    expect(screen.queryByTestId('import-btn-apply')).not.toBeOnTheScreen();
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
  it('explains what reducing transparency does under the switch', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <AppearanceSection theme="system" onThemeChange={jest.fn()} reduceTransparency={false} onReduceTransparencyChange={onChange} transparencyNote={transparencyNote(false)} />,
    );
    expect(screen.getByTestId('settings-text-transparency-note')).toHaveTextContent(/frosted glass that lets the page show through/);
    expect(screen.getByTestId('settings-text-transparency-note')).toHaveTextContent(/Scores and tables are always on solid backgrounds/);
    await user.press(screen.getByTestId('settings-toggle-transparency'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("says when the phone's Reduce Transparency already makes glass solid", async () => {
    await renderWithTheme(
      <AppearanceSection theme="system" onThemeChange={jest.fn()} onReduceTransparencyChange={jest.fn()} transparencyNote={transparencyNote(true)} />,
    );
    expect(screen.getByTestId('settings-text-transparency-note')).toHaveTextContent("Your phone's Reduce Transparency is on, so bars and sheets are already solid.");
  });

  it('hides the switch and note when the setting is not wired', async () => {
    await renderWithTheme(<AppearanceSection theme="light" onThemeChange={jest.fn()} />);
    expect(screen.queryByTestId('settings-toggle-transparency')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('settings-text-transparency-note')).not.toBeOnTheScreen();
  });
});
