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
      <ListRow title="Format presets" trailing={{ kind: 'chevron' }} onPress={() => onOpen('presets')} testID="settings-btn-presets" />
      <SectionHeader title="Data" />
      <ListRow
        title="Backup & import"
        subtitle="Save your data to a file or restore it"
        trailing={{ kind: 'chevron' }}
        onPress={() => onOpen('backup')}
        testID="settings-btn-backup"
      />
      <ListRow title="Diagnostics" trailing={{ kind: 'chevron' }} onPress={() => onOpen('diagnostics')} testID="settings-btn-diagnostics" />
    </>
  );
}
