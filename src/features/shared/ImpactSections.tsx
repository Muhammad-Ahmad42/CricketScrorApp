import { StyleSheet, View } from 'react-native';
import { Separator, Text, space } from '@/ui';
import type { ImpactFixtureVM, ImpactLineVM, ImpactViewModel } from './impactViewModel';
import { Notice } from './Notice';

function SectionTitle({ title }: { readonly title: string }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.sectionTitle}>
      {title}
    </Text>
  );
}

function FixtureLine({ fixture, testID }: { readonly fixture: ImpactFixtureVM; readonly testID: string }) {
  const spoken = `${fixture.label} ${fixture.change}${fixture.hasMatchData ? ', has scores' : ''}`;
  return (
    <View style={styles.line} accessible accessibilityLabel={spoken} testID={testID}>
      <Text variant="tableNumeric" style={styles.glyph}>
        {fixture.glyph}
      </Text>
      <Text variant="callout" style={styles.flex}>
        {fixture.label}
      </Text>
      <Text variant="footnote" tone="secondary">
        {fixture.change}
      </Text>
      {fixture.hasMatchData ? (
        <Text variant="footnote" tone="warning">
          (has scores)
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

export interface ImpactSectionsProps {
  readonly vm: ImpactViewModel;
  readonly showHeadline?: boolean;
}

export function ImpactSections({ vm, showHeadline = true }: ImpactSectionsProps) {
  return (
    <View style={styles.root}>
      {showHeadline ? (
        <View style={styles.block}>
          <Text variant="headline" testID="impact-text-headline">
            {vm.headline}
          </Text>
          {vm.lines.map((line, index) => (
            <Text key={`${index}:${line}`} variant="callout" tone="secondary">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {vm.severityNotice ? (
        <Notice tone={vm.destructive ? 'danger' : 'warning'} message={vm.severityNotice} testID="impact-text-severity" />
      ) : null}
      {vm.fixtures.length > 0 ? (
        <View style={styles.block}>
          <Separator />
          <SectionTitle title="Fixtures" />
          {vm.fixtures.map((fixture, position) => (
            <FixtureLine key={fixture.key} fixture={fixture} testID={`impact-row-${position + 1}`} />
          ))}
        </View>
      ) : null}
      {vm.standings.length > 0 ? (
        <View style={styles.block}>
          <Separator />
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
  root: { gap: space.md },
  block: { gap: space.xs },
  sectionTitle: { paddingTop: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 28 },
  textLine: { gap: 2 },
  glyph: { width: 16 },
  flex: { flex: 1 },
});
