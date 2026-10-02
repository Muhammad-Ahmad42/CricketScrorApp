import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HypotheticalResult, TournamentId, WhatIfResult } from '@/domain/types';
import { Notice, plural } from '@/features/shared';
import { BoundaryRule, Button, EmptyState, ListRow, SectionHeader, Text, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { StandingsHeader, StandingsRow, standingsColumns } from '../components/StandingsTable';
import { showError } from '../hooks/toast';
import type { FixtureRowVM } from '../selectors/fixtures';
import type { TournamentIndex } from '../selectors/names';
import { outcomeLabel, remainingRows, whatIfTables } from '../selectors/whatIf';
import { HypotheticalSheet } from '../sheets/HypotheticalSheet';
import { TournamentContainer } from './TournamentContainer';

export interface WhatIfScreenProps {
  readonly tournamentId: TournamentId;
}

export const SIMULATION_NOTICE = 'Simulation only. Nothing in the tournament changes.';

function WhatIfResultView({ index, result }: { readonly index: TournamentIndex; readonly result: WhatIfResult }) {
  const tables = whatIfTables(index, result);
  return (
    <View testID="whatif-result">
      <BoundaryRule />
      <SectionHeader title="If these results happen" />
      <View style={styles.narrative}>
        {result.narrative.length === 0 ? (
          <Text variant="callout" tone="secondary">
            No positions or qualification places change.
          </Text>
        ) : (
          result.narrative.map((line, position) => (
            <Text key={`${position}:${line}`} variant="callout" testID={`whatif-text-narrative-${position + 1}`}>
              {line}
            </Text>
          ))
        )}
      </View>
      {tables.map((table) => {
        const columns = standingsColumns(table.rows.map((entry) => entry.row), false);
        return (
        <View key={table.key}>
          <SectionHeader title={table.title} />
          <StandingsHeader columns={columns} />
          {table.rows.map((entry, position) => (
            <View key={entry.row.key} style={styles.deltaRow}>
              <View style={styles.flex}>
                <StandingsRow row={entry.row} ordinal={position + 1} tableKey={table.key} columns={columns} compact testIDPrefix="whatif-standings" />
              </View>
              <Text
                variant="tableNumeric"
                style={styles.delta}
                accessibilityLabel={entry.delta === '–' ? 'No change' : entry.delta.startsWith('▲') ? `Up ${entry.delta.slice(1)}` : `Down ${entry.delta.slice(1)}`}
                testID={`whatif-text-delta-${table.key}-${position + 1}`}
              >
                {entry.delta}
              </Text>
            </View>
          ))}
        </View>
        );
      })}
    </View>
  );
}

function WhatIfBody({ index }: { readonly index: TournamentIndex }) {
  const rows = remainingRows(index);
  const [choices, setChoices] = useState<ReadonlyMap<string, HypotheticalResult>>(new Map());
  const [editing, setEditing] = useState<FixtureRowVM | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [running, setRunning] = useState(false);
  const ballsPerOver = index.snapshot.rules.defaultMatchRules.ballsPerOver;

  const run = async () => {
    setRunning(true);
    const simulated = await useTournamentStore.getState().whatIf([...choices.values()]);
    setRunning(false);
    if (simulated === null) {
      showError(useTournamentStore.getState().error, "Couldn't run the simulation.");
      return;
    }
    setResult(simulated);
  };

  const reset = () => {
    setChoices(new Map());
    setResult(null);
  };

  if (rows.length === 0) {
    return (
      <View>
        <Notice tone="info" message={SIMULATION_NOTICE} testID="whatif-text-banner" />
        <EmptyState icon="trophy" title="Nothing left to simulate" body="Every fixture of this stage has been played." testID="whatif-empty" />
      </View>
    );
  }

  return (
    <View>
      <Notice tone="info" message={SIMULATION_NOTICE} testID="whatif-text-banner" />
      <SectionHeader title={`Remaining · ${index.stageName(rows[0].stageId)}`} />
      {rows.map((row) => {
        const chosen = choices.get(row.fixtureId);
        return (
          <ListRow
            key={row.key}
            title={`${row.label} ${row.teamsText}`}
            trailing={{ kind: 'value', text: chosen ? outcomeLabel(chosen.outcome, row) : '–', chevron: true }}
            onPress={() => setEditing(row)}
            testID={`whatif-row-${row.matchNumber}`}
          />
        );
      })}
      <View style={styles.actions}>
        <Text variant="footnote" tone="secondary" testID="whatif-text-count">
          {plural(choices.size, 'hypothetical result')}
        </Text>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button label="See outcome" onPress={() => void run()} disabled={choices.size === 0} loading={running} fullWidth testID="whatif-btn-run" />
          </View>
          <Button label="Clear" variant="tertiary" onPress={reset} testID="whatif-btn-reset" />
        </View>
      </View>
      {result ? <WhatIfResultView index={index} result={result} /> : null}
      {editing ? (
        <HypotheticalSheet
          visible
          row={editing}
          ballsPerOver={ballsPerOver}
          current={choices.get(editing.fixtureId) ?? null}
          onClose={() => setEditing(null)}
          onDone={(value) => {
            const next = new Map(choices);
            if (value === null) {
              next.delete(editing.fixtureId);
            } else {
              next.set(editing.fixtureId, value);
            }
            setChoices(next);
            setResult(null);
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}

export function WhatIfScreen({ tournamentId }: WhatIfScreenProps) {
  return (
    <TournamentContainer tournamentId={tournamentId} testID="screen-what-if" title="What if…">
      {(index) => <WhatIfBody index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  narrative: { paddingHorizontal: space.md, gap: space.xs },
  actions: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.xs },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  deltaRow: { flexDirection: 'row', alignItems: 'center' },
  delta: { width: 40, textAlign: 'right', paddingRight: space.md },
});
