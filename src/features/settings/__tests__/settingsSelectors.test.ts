/** @jest-environment node */
import { BUILTIN_FORMAT_PRESETS } from '@/domain/scoring';
import {
  DOT_CHOICES,
  MOTION_CHOICES,
  PAD_CHOICES,
  THEME_CHOICES,
  formatLabel,
  scoringPatch,
  selectSettingsVM,
  transparencyNote,
} from '../selectors/settings';
import { appSettings } from './support/fixtures';

const E2E_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('settings view model', () => {
  it('exposes the E2E chip ids of every choice (E2E_TEST_PLAN §3.7)', () => {
    expect(THEME_CHOICES.map((choice) => choice.testID)).toEqual(['settings-chip-theme-light', 'settings-chip-theme-dark', 'settings-chip-theme-system']);
    expect(MOTION_CHOICES.map((choice) => choice.testID)).toEqual(['settings-chip-motion-system', 'settings-chip-motion-on', 'settings-chip-motion-off']);
    expect(DOT_CHOICES.map((choice) => choice.testID)).toEqual(['settings-chip-dot-zero', 'settings-chip-dot-dot']);
    expect(PAD_CHOICES.map((choice) => choice.testID)).toEqual(['settings-chip-pad-right', 'settings-chip-pad-left']);
    for (const choice of [...THEME_CHOICES, ...MOTION_CHOICES, ...DOT_CHOICES, ...PAD_CHOICES]) {
      expect(choice.testID).toMatch(E2E_ID);
      expect(choice.accessibilityLabel.length).toBeGreaterThan(choice.label.length);
    }
  });

  it('maps every stored setting and defaults the pad to the right hand when absent', () => {
    const vm = selectSettingsVM(appSettings(), BUILTIN_FORMAT_PRESETS);
    expect(vm).toEqual({
      theme: 'system',
      reducedMotion: 'system',
      reduceTransparency: false,
      hapticsEnabled: true,
      soundEnabled: false,
      dotStyle: 'zero',
      padHand: 'right',
      autoPromptBowler: true,
      confirmInningsEnd: false,
      keepAwake: true,
      defaultFormatLabel: 'T20',
    });
    const left = selectSettingsVM(appSettings({ scoring: { ...appSettings().scoring, padHand: 'left' } }), BUILTIN_FORMAT_PRESETS);
    expect(left.padHand).toBe('left');
  });

  it('maps the reduce transparency switch, reading a missing value as off (§106)', () => {
    expect(selectSettingsVM(appSettings({ reduceTransparency: true }), BUILTIN_FORMAT_PRESETS).reduceTransparency).toBe(true);
    expect('reduceTransparency' in appSettings()).toBe(false);
    expect(selectSettingsVM(appSettings(), BUILTIN_FORMAT_PRESETS).reduceTransparency).toBe(false);
    expect(selectSettingsVM(appSettings({ reduceTransparency: false }), BUILTIN_FORMAT_PRESETS).reduceTransparency).toBe(false);
  });

  it("explains the glass, or says the phone's setting already makes it solid (§106)", () => {
    expect(transparencyNote(false)).toMatch(/frosted glass that lets the page show through/);
    expect(transparencyNote(false)).toMatch(/easier to read in bright sun/);
    expect(transparencyNote(true)).toBe("Your phone's Reduce Transparency is on, so bars and sheets are already solid.");
  });

  it('labels the default format from the presets, Custom, or a user preset', () => {
    expect(formatLabel('T50', BUILTIN_FORMAT_PRESETS)).toBe('T50');
    expect(formatLabel('custom', BUILTIN_FORMAT_PRESETS)).toBe('Custom');
    expect(formatLabel('6f1c0d1e-0000-4000-8000-000000000000', BUILTIN_FORMAT_PRESETS)).toBe('Your preset');
  });

  it('patches one scoring preference while keeping the others', () => {
    const current = { ...appSettings().scoring, padHand: 'left' as const };
    expect(scoringPatch(current, { dotStyle: 'dot' })).toEqual({ scoring: { ...current, dotStyle: 'dot' } });
    expect(current.dotStyle).toBe('zero');
  });
});
