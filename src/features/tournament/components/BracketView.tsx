import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text, space, useTheme } from '@/ui';
import type { BracketMatchVM, BracketSideVM, BracketVM } from '../selectors/bracket';

const COLUMN_WIDTH = 188;
const BOX_HEIGHT = 112;

function sideDetail(side: BracketSideVM): string | null {
  const label = side.slotLabel && side.slotLabel !== side.text ? side.slotLabel : null;
  const parts = [label, side.score].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' ') : null;
}

function detailLine(match: BracketMatchVM): string | null {
  if (match.kind === 'bye') {
    return 'Bye: straight through to the next round';
  }
  const parts = [sideDetail(match.a), sideDetail(match.b)];
  if (parts.every((part) => part === null)) {
    return null;
  }
  return parts.map((part) => part ?? '–').join(' · ');
}

interface MatchBoxProps {
  readonly match: BracketMatchVM;
  readonly onPress?: (fixtureId: string) => void;
}

function MatchBox({ match, onPress }: MatchBoxProps) {
  const theme = useTheme();
  const id = `${match.round}-${match.position}`;
  const bye = match.kind === 'bye';
  const pressable = !bye && match.fixtureId !== null && onPress !== undefined;
  const detail = detailLine(match);
  return (
    <Pressable
      testID={`bracket-row-${id}`}
      accessibilityRole={pressable ? 'button' : 'text'}
      accessibilityLabel={match.accessibilityLabel}
      disabled={!pressable}
      onPress={() => {
        if (match.fixtureId && onPress) {
          onPress(match.fixtureId);
        }
      }}
      style={({ pressed }) => [
        styles.box,
        {
          backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface,
          borderColor: bye ? theme.color.border : theme.color.borderStrong,
          borderWidth: theme.borderWidth.control,
          borderStyle: bye ? 'dashed' : 'solid',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <View style={styles.boxHeader}>
        <Text variant="label" tone="secondary" numberOfLines={1}>
          {match.label}
        </Text>
        {match.when ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {match.when}
          </Text>
        ) : null}
      </View>
      <Text variant={bye ? 'subhead' : 'bodyStrong'} testID={`bracket-text-sides-${id}`} numberOfLines={2}>
        {bye ? match.a.text : match.sidesText}
      </Text>
      {detail ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {match.winnerText ? (
        <View style={styles.winnerLine}>
          <Icon name="check" size={16} color="success" />
          <Text variant="footnote" tone="success" testID={`bracket-text-winner-${id}`} numberOfLines={1}>
            {`${match.winnerText} won`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export interface BracketViewProps {
  readonly bracket: BracketVM;
  readonly onOpenFixture?: (fixtureId: string) => void;
}

export function BracketView({ bracket, onOpenFixture }: BracketViewProps) {
  const theme = useTheme();
  const firstCount = Math.max(1, bracket.rounds[0]?.matches.length ?? 1);
  const height = firstCount * (BOX_HEIGHT + space.sm);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll} testID="bracket-scroll">
        {bracket.rounds.map((round) => (
          <View key={round.round} style={styles.column}>
            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.roundTitle}>
              {round.name}
            </Text>
            <View style={[styles.columnBody, { height }]}>
              {round.matches.map((match) => (
                <View key={match.key} style={styles.slot}>
                  <MatchBox match={match} onPress={onOpenFixture} />
                  <View style={[styles.connector, { backgroundColor: theme.color.border }]} />
                </View>
              ))}
            </View>
          </View>
        ))}
        {bracket.champion !== null ? (
          <View style={[styles.column, styles.championColumn]}>
            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.roundTitle}>
              Champion
            </Text>
            <View style={[styles.columnBody, { height }]}>
              <View style={styles.championBox} accessible accessibilityLabel={`Champion: ${bracket.champion}`}>
                <Icon name="trophy" size={24} color="accent" />
                <Text variant="headline" testID="bracket-text-champion">
                  {bracket.champion}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
      {bracket.thirdPlace ? (
        <View style={styles.third}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Third place
          </Text>
          <MatchBox match={bracket.thirdPlace} onPress={onOpenFixture} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.md, gap: space.md },
  column: { width: COLUMN_WIDTH },
  championColumn: { width: 140 },
  roundTitle: { paddingVertical: space.xs },
  columnBody: { justifyContent: 'space-around' },
  slot: { flexDirection: 'row', alignItems: 'center' },
  box: { width: COLUMN_WIDTH - space.sm, minHeight: BOX_HEIGHT - space.xs, padding: space.xs, gap: 2 },
  boxHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xxs },
  winnerLine: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  connector: { width: space.sm, height: 1 },
  championBox: { alignItems: 'center', justifyContent: 'center', gap: space.xs, flex: 1 },
  third: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.xs },
});
