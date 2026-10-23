import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { FormatId } from '@/domain/types';
import { Banner, Screen, ScreenHeader, useSystemAccessibility } from '@/ui';
import { AboutSection } from '../components/AboutSection';
import { AppearanceSection } from '../components/AppearanceSection';
import { BusyLine } from '../components/BusyLine';
import { FeedbackSection } from '../components/FeedbackSection';
import { LinkSections } from '../components/LinkSections';
import { ScoringSection } from '../components/ScoringSection';
import { FORMAT_PRESETS, SETTINGS_ROUTES, SOUND_EFFECTS_AVAILABLE, type SettingsRoute } from '../constants';
import { COPY } from '../copy';
import { useEnsureSettingsLoaded, useSettingsWriter } from '../hooks/useSettingsWriter';
import { readAppInfo } from '../platform/appInfo';
import { presetRows } from '../selectors/presets';
import { problemText } from '../selectors/problem';
import { selectSettingsVM } from '../selectors/settings';
import { DefaultFormatSheet } from '../sheets/DefaultFormatSheet';

export function SettingsScreen() {
  const loading = useEnsureSettingsLoaded();
  const locked = !loading.loaded;
  const router = useRouter();
  const { settings, save, saveScoring } = useSettingsWriter();
  const [formatSheetOpen, setFormatSheetOpen] = useState(false);
  const [app] = useState(readAppInfo);
  const vm = selectSettingsVM(settings, FORMAT_PRESETS);
  const systemReducedTransparency = useSystemAccessibility('reduceTransparency');
  const loadProblem = problemText(COPY.settingsLoadFailed);

  const open = (route: SettingsRoute) => router.push(SETTINGS_ROUTES[route]);
  const chooseFormat = (formatId: FormatId) => {
    setFormatSheetOpen(false);
    if (formatId !== settings.defaultFormatId) {
      void save({ defaultFormatId: formatId });
    }
  };

  return (
    <Screen testID="screen-settings" barTitle="Settings">
      <ScreenHeader title="Settings" />
      {loading.failed ? (
        <Banner
          tone="danger"
          message={loadProblem.headline}
          supporting={loadProblem.supporting}
          action={{ label: COPY.tryAgain, onPress: loading.retry, testID: 'settings-btn-retry-load' }}
          testID="settings-banner-load-error"
        />
      ) : locked ? (
        <BusyLine text={COPY.settingsLoading} testID="settings-text-loading" />
      ) : null}
      <AppearanceSection
        theme={vm.theme}
        onThemeChange={(theme) => void save({ theme })}
        reduceTransparency={vm.reduceTransparency}
        systemReduceTransparency={systemReducedTransparency}
        onReduceTransparencyChange={(reduceTransparency) => void save({ reduceTransparency })}
        disabled={locked}
      />
      <ScoringSection
        defaultFormatLabel={vm.defaultFormatLabel}
        dotStyle={vm.dotStyle}
        padHand={vm.padHand}
        autoPromptBowler={vm.autoPromptBowler}
        confirmInningsEnd={vm.confirmInningsEnd}
        keepAwake={vm.keepAwake}
        onOpenDefaultFormat={() => setFormatSheetOpen(true)}
        onDotStyleChange={(dotStyle) => void saveScoring({ dotStyle })}
        onPadHandChange={(padHand) => void saveScoring({ padHand })}
        onAutoPromptBowlerChange={(autoPromptBowler) => void saveScoring({ autoPromptBowler })}
        onConfirmInningsEndChange={(confirmInningsEnd) => void saveScoring({ confirmInningsEnd })}
        onKeepAwakeChange={(keepAwake) => void saveScoring({ keepAwake })}
        disabled={locked}
      />
      <FeedbackSection
        hapticsEnabled={vm.hapticsEnabled}
        soundEnabled={vm.soundEnabled}
        soundAvailable={SOUND_EFFECTS_AVAILABLE}
        reducedMotion={vm.reducedMotion}
        onHapticsChange={(hapticsEnabled) => void save({ hapticsEnabled })}
        onSoundChange={(soundEnabled) => void save({ soundEnabled })}
        onReducedMotionChange={(reducedMotion) => void save({ reducedMotion })}
        disabled={locked}
      />
      <LinkSections onOpen={open} />
      <AboutSection version={app.version} onOpenAbout={() => open('about')} />
      <DefaultFormatSheet
        visible={formatSheetOpen}
        presets={presetRows(FORMAT_PRESETS, settings.defaultFormatId)}
        onSelect={chooseFormat}
        onClose={() => setFormatSheetOpen(false)}
      />
    </Screen>
  );
}
