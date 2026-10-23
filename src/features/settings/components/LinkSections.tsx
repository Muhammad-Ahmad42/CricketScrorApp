import { ListRow, SectionHeader } from '@/ui';
import type { SettingsRoute } from '../constants';

export interface LinkSectionsProps {
  readonly onOpen: (route: SettingsRoute) => void;
}

export function LinkSections({ onOpen }: LinkSectionsProps) {
  return (
    <>
      <SectionHeader title="Library" />
      <ListRow title="Teams & players" trailing={{ kind: 'chevron' }} onPress={() => onOpen('teams')} testID="settings-btn-teams" />
      <ListRow title="Format presets" trailing={{ kind: 'chevron' }} onPress={() => onOpen('presets')} separator={false} testID="settings-btn-presets" />
      <SectionHeader title="Data" />
      <ListRow
        title="Backup & import"
        trailing={{ kind: 'chevron' }}
        onPress={() => onOpen('backup')}
        accessibilityHint="Save your data to a file or restore it"
        testID="settings-btn-backup"
      />
      <ListRow title="Diagnostics" trailing={{ kind: 'chevron' }} onPress={() => onOpen('diagnostics')} separator={false} testID="settings-btn-diagnostics" />
    </>
  );
}
