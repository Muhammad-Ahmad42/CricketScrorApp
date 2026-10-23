import { ListRow, SectionHeader } from '@/ui';

export interface AboutSectionProps {
  readonly version: string;
  readonly onOpenAbout: () => void;
}

export function AboutSection({ version, onOpenAbout }: AboutSectionProps) {
  return (
    <>
      <SectionHeader title="About" />
      <ListRow
        title="About & privacy"
        trailing={{ kind: 'value', text: version, chevron: true }}
        accessibilityLabel={`About & privacy, version ${version}`}
        onPress={onOpenAbout}
        separator={false}
        testID="settings-btn-about"
      />
    </>
  );
}
