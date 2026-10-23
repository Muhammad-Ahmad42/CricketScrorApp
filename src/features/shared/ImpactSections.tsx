import { StyleSheet, View } from 'react-native';
import { DETAILS_LABEL, Icon, InlineNotice, Separator, Text, space, type IconName } from '@/ui';
import type { ImpactFixtureKind, ImpactFixtureVM, ImpactLineVM, ImpactViewModel } from './impactViewModel';

const KIND_ICON: { readonly [K in ImpactFixtureKind]: IconName } = {
  added: 'plus',
  removed: 'minus',
  changed: 'pencil-line',
};

function SectionTitle({ title }: { readonly title: string }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.sectionTitle}>
      {title}
    </Text>
  );
}

function FixtureLine({ fixture, testID }: { readonly fixture: ImpactFixtureVM; readonly testID: string }) {
  const spoken = [`${fixture.label}: ${fixture.change}`, fixture.note].filter(Boolean).join('. ');
  return (
    <View style={styles.fixture} accessible accessibilityLabel={spoken} testID={testID}>
      <Text variant="callout">{fixture.label}</Text>
      <View style={styles.change}>
        <Icon name={KIND_ICON[fixture.kind]} size={16} color={fixture.kind === 'removed' ? 'danger' : 'textSecondary'} />
        <Text variant="footnote" weight="semibold" tone={fixture.kind === 'removed' ? 'danger' : 'secondary'} style={styles.flex}>
          {fixture.change}
        </Text>
      </View>
      {fixture.note ? (
        <Text variant="footnote" tone={fixture.hasMatchData ? 'warning' : 'secondary'}>
          {fixture.note}
        </Text>
      ) : null}
    </View>
  );
}

function TextLines({ lines, testIDPrefix }: { readonly lines: readonly ImpactLineVM[]; readonly testIDPrefix: string }) {
  return (
    <>
      {lines.map((line, index) => (
        <View key={line.key} style={styles.textLine}>
          <Text variant="callout" testID={`${testIDPrefix}-${index + 1}`}>
            {line.text}
          </Text>
          {line.note ? (
            <Text variant="footnote" tone={line.warn ? 'warning' : 'secondary'}>
              {line.note}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}

export function hasImpactSections(vm: ImpactViewModel): boolean {
  return vm.fixtures.length + vm.standings.length + vm.qualification.length + vm.slots.length > 0 || vm.nrrText !== null;
}

export function impactDetailsLabel(_vm?: ImpactViewModel): string {
  return DETAILS_LABEL;
}

export interface ImpactSectionsProps {
  readonly vm: ImpactViewModel;
  readonly showShortfalls?: boolean;
}

export function ImpactSections({ vm, showShortfalls = true }: ImpactSectionsProps) {
  return (
    <View style={styles.root}>
      {showShortfalls
        ? vm.shortfalls.map((line, index) => (
            <InlineNotice key={line.key} tone="warning" headline={line.text} detail={line.detail ?? null} testID={`impact-text-shortfall-${index + 1}`} />
          ))
        : null}
      {vm.fixtures.length > 0 ? (
        <View style={styles.block}>
          <SectionTitle title="Fixtures" />
          {vm.fixtures.map((fixture, position) => (
            <FixtureLine key={fixture.key} fixture={fixture} testID={`impact-row-${position + 1}`} />
          ))}
        </View>
      ) : null}
      {vm.standings.length > 0 ? (
        <View style={styles.block}>
          {vm.fixtures.length > 0 ? <Separator /> : null}
          <SectionTitle title="Standings" />
          <TextLines lines={vm.standings} testIDPrefix="impact-text-standing" />
        </View>
      ) : null}
      {vm.qualification.length > 0 ? (
        <View style={styles.block}>
          <Separator />
          <SectionTitle title="Qualification" />
          <TextLines lines={vm.qualification} testIDPrefix="impact-text-qualification" />
        </View>
      ) : null}
      {vm.slots.length > 0 ? (
        <View style={styles.block}>
          <Separator />
          <SectionTitle title="Slots" />
          <TextLines lines={vm.slots} testIDPrefix="impact-text-slot" />
        </View>
      ) : null}
      {vm.nrrText ? (
        <Text variant="callout" tone="secondary">
          {vm.nrrText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  block: { gap: space.xs },
  sectionTitle: { paddingTop: space.xxs },
  fixture: { gap: space.xxs, paddingVertical: space.xxs },
  change: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  flex: { flexShrink: 1 },
  textLine: { gap: space.xxs },
});
