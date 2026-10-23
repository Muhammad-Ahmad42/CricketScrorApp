import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Badge, Icon, Inset, PressableCard, Text, space, useGutter, useLayoutClass, useTheme } from '@/ui';
import type { BracketMatchVM, BracketSideVM, BracketVM } from '../selectors/bracket';

export const BRACKET_COLUMN_WIDTH = 232;
const BOX_HEIGHT = 136;
const CONNECTOR = space.md;
export const CHAMPION_MIN_WIDTH = 160;

function SideLine({ side, testID }: { readonly side: BracketSideVM; readonly testID: string }) {
  const theme = useTheme();
  return (
    <View style={styles.side} testID={testID}>
      {side.chip ? (
        <View style={[styles.chip, { borderColor: theme.color.borderStrong, borderWidth: theme.borderWidth.control, borderRadius: theme.radius.xs }]}>
          <Text variant="label" tone="secondary">
            {side.chip}
          </Text>
        </View>
      ) : null}
      <View style={styles.sideText}>
        <Text variant={side.pending ? 'subhead' : 'body'} tone={side.pending ? 'secondary' : 'primary'} weight={side.winner ? 'bold' : side.pending ? undefined : 'medium'}>
          {side.name}
        </Text>
        {side.provisional ? <Badge label="Provisional" tone="provisional" /> : null}
      </View>
      {side.winner ? <Icon name="check" size={16} color="success" /> : null}
      {side.score ? (
        <Text variant="figureSmall" tone={side.winner ? 'primary' : 'secondary'}>
          {side.score}
        </Text>
      ) : null}
    </View>
  );
}

interface MatchBoxProps {
  readonly match: BracketMatchVM;
  readonly showLabel?: boolean;
  readonly fill?: boolean;
  readonly onPress?: (fixtureId: string) => void;
}

function ByeBox({ testID, label, children }: { readonly testID: string; readonly label: string; readonly children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.box,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          borderWidth: theme.borderWidth.control,
          borderStyle: 'dashed',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      {children}
    </View>
  );
}

function MatchBox({ match, showLabel = true, fill = false, onPress }: MatchBoxProps) {
  const theme = useTheme();
  const id = `${match.round}-${match.position}`;
  const bye = match.kind === 'bye';
  const fixtureId = match.fixtureId;
  const open = !bye && fixtureId !== null && onPress !== undefined ? () => onPress(fixtureId) : undefined;
  const content = (
    <>
      {showLabel || match.when ? (
        <View style={styles.boxHeader}>
          {showLabel ? (
            <Text variant="label" tone="secondary" numberOfLines={1}>
              {match.label}
            </Text>
          ) : (
            <View />
          )}
          {match.when ? (
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {match.when}
            </Text>
          ) : null}
        </View>
      ) : null}
      {bye ? (
        <View testID={`bracket-text-sides-${id}`}>
          <SideLine side={match.a} testID={`bracket-text-side-${id}-a`} />
          <Text variant="footnote" tone="secondary">
            Bye: straight through
          </Text>
        </View>
      ) : (
        <View style={styles.sides} testID={`bracket-text-sides-${id}`}>
          <SideLine side={match.a} testID={`bracket-text-side-${id}-a`} />
          <View style={[styles.divider, { backgroundColor: theme.color.border }]} />
          <SideLine side={match.b} testID={`bracket-text-side-${id}-b`} />
        </View>
      )}
    </>
  );
  const box = bye ? (
    <ByeBox testID={`bracket-row-${id}`} label={match.accessibilityLabel}>
      {content}
    </ByeBox>
  ) : (
    <PressableCard testID={`bracket-row-${id}`} accessibilityLabel={match.accessibilityLabel} onPress={open} radius="md" gap="xs" padding="sm">
      {content}
    </PressableCard>
  );
  return <View style={fill ? styles.boxFill : styles.boxFixed}>{box}</View>;
}

function ChampionBlock({ champion, fill }: { readonly champion: string; readonly fill: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.championBox, fill ? styles.championFill : null, fill ? { borderColor: theme.color.borderStrong, borderWidth: theme.borderWidth.control, borderRadius: theme.radius.md } : null]}
      accessible
      accessibilityLabel={`Champion: ${champion}`}
    >
      <Icon name="trophy" size={24} color="accent" />
      <Text variant="headline" testID="bracket-text-champion">
        {champion}
      </Text>
    </View>
  );
}

export interface BracketViewProps {
  readonly bracket: BracketVM;
  readonly onOpenFixture?: (fixtureId: string) => void;
}

function StackedBracket({ bracket, onOpenFixture }: BracketViewProps) {
  const gutter = useGutter();
  return (
    <View style={[styles.stack, { paddingHorizontal: gutter }]} testID="bracket-stack">
      {bracket.rounds.map((round) => (
        <View key={round.round} style={styles.stackRound}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {round.name}
          </Text>
          {round.matches.map((match) => (
            <MatchBox key={match.key} match={match} fill showLabel={match.label !== round.name} onPress={onOpenFixture} />
          ))}
        </View>
      ))}
      {bracket.champion !== null ? (
        <View style={styles.stackRound}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Champion
          </Text>
          <ChampionBlock champion={bracket.champion} fill />
        </View>
      ) : null}
      {bracket.thirdPlace ? (
        <View style={styles.stackRound}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Third place
          </Text>
          <MatchBox match={bracket.thirdPlace} fill showLabel={!/third/i.test(bracket.thirdPlace.label)} onPress={onOpenFixture} />
        </View>
      ) : null}
    </View>
  );
}

function WideBracket({ bracket, onOpenFixture }: BracketViewProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const firstCount = Math.max(1, bracket.rounds[0]?.matches.length ?? 1);
  const height = firstCount * (BOX_HEIGHT + space.sm);
  const lastRound = bracket.rounds.length - 1;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter }]} testID="bracket-scroll">
        {bracket.rounds.map((round, roundIndex) => (
          <View key={round.round} style={styles.column}>
            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.roundTitle}>
              {round.name}
            </Text>
            <View style={[styles.columnBody, { height }]}>
              {round.matches.map((match) => (
                <View key={match.key} style={styles.slot}>
                  <MatchBox match={match} showLabel={match.label !== round.name} onPress={onOpenFixture} />
                  {roundIndex < lastRound || bracket.champion !== null ? (
                    <View style={[styles.connector, { height: theme.borderWidth.emphasis, backgroundColor: theme.color.borderStrong }]} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        {bracket.champion !== null ? (
          <View style={styles.championColumn}>
            <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.roundTitle}>
              Champion
            </Text>
            <View style={[styles.columnBody, { height }]}>
              <ChampionBlock champion={bracket.champion} fill={false} />
            </View>
          </View>
        ) : null}
      </ScrollView>
      {bracket.thirdPlace ? (
        <Inset top="md" gap="xs">
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Third place
          </Text>
          <MatchBox match={bracket.thirdPlace} showLabel={!/third/i.test(bracket.thirdPlace.label)} onPress={onOpenFixture} />
        </Inset>
      ) : null}
    </View>
  );
}

export function BracketView({ bracket, onOpenFixture }: BracketViewProps) {
  const layout = useLayoutClass();
  return layout.width === 'compact' || layout.width === 'compact-s' ? (
    <StackedBracket bracket={bracket} onOpenFixture={onOpenFixture} />
  ) : (
    <WideBracket bracket={bracket} onOpenFixture={onOpenFixture} />
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  stackRound: { gap: space.xs },
  scroll: { gap: space.xs },
  column: { width: BRACKET_COLUMN_WIDTH + CONNECTOR },
  championColumn: { minWidth: CHAMPION_MIN_WIDTH },
  roundTitle: { paddingVertical: space.xs },
  columnBody: { justifyContent: 'space-around' },
  slot: { flexDirection: 'row', alignItems: 'center' },
  box: { padding: space.sm, gap: space.xs },
  boxFixed: { width: BRACKET_COLUMN_WIDTH },
  boxFill: { alignSelf: 'stretch' },
  boxHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.xs },
  sides: { gap: space.xxs },
  divider: { height: StyleSheet.hairlineWidth },
  side: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 28 },
  chip: { minWidth: 32, paddingHorizontal: space.xxs, alignItems: 'center' },
  sideText: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xxs },
  connector: { width: CONNECTOR },
  championBox: { alignItems: 'center', justifyContent: 'center', gap: space.xs, flex: 1, padding: space.md },
  championFill: { flex: 0 },
});
