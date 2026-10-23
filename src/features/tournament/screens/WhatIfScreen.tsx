import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HypotheticalResult, TournamentId, WhatIfResult } from '@/domain/types';
import { plural } from '@/features/shared';
import { Banner, Button, Disclosure, EmptyState, Inset, ListRow, SectionHeader, Text, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { StandingsTable } from '../components/StandingsTable';
import { showError } from '../hooks/toast';
import type { FixtureRowVM } from '../selectors/fixtures';
import type { TournamentIndex } from '../selectors/names';
import { outcomeLabel, remainingRows, whatIfNarrative, whatIfNrr, whatIfTables } from '../selectors/whatIf';
import { HypotheticalSheet } from '../sheets/HypotheticalSheet';
import { TournamentContainer } from './TournamentContainer';

export interface WhatIfScreenProps {
  readonly tournamentId: TournamentId;
}

export function choiceText(chosen: HypotheticalResult, row: FixtureRowVM): string {
  const label = outcomeLabel(chosen.outcome, row);
  const margin = chosen.margin ?? null;
  if (margin === null) {
    return label;
  }
  return margin.kind === 'runs'
    ? `${label} by ${margin.runs} run${margin.runs === 1 ? '' : 's'}`
    : `${label} by ${margin.wickets} wicket${margin.wickets === 1 ? '' : 's'}`;
}

export const SIMULATION_NOTICE = 'Simulation only · nothing is saved';

function WhatIfResultView({ index, result }: { readonly index: TournamentIndex; readonly result: WhatIfResult }) {
  const tables = whatIfTables(index, result);
  const nrr = whatIfNrr(result);
  const narrative = whatIfNarrative(result);
  return (
    <View testID="whatif-result" style={styles.result}>
      <SectionHeader title="If these results happen" />
      <Inset gap="xs">
        {narrative.length === 0 ? (
          <Text variant="callout" tone="secondary">
            No positions or qualification places change.
          </Text>
        ) : (
          narrative.map((line, position) => (
            <View key={line.key} style={styles.line}>
              <Text variant="callout" testID={`whatif-text-narrative-${position + 1}`}>
                {line.headline}
              </Text>
              {line.detail ? (
                <Text variant="footnote" tone="secondary">
                  {line.detail}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Inset>
      {tables.map((table) => (
        <View key={table.key}>
          <SectionHeader title={table.title} />
          <StandingsTable
            table={table.table}
            compact
            delta
            nrrHeader={nrr.header}
            testIDPrefix="whatif-standings"
            deltaTestID={(ordinal) => `whatif-text-delta-${table.key}-${ordinal}`}
          />
        </View>
      ))}
      {nrr.headline && (nrr.notes.length > 0 || nrr.legend) ? (
        <Inset top="sm" gap="xxs" testID="whatif-nrr-notes">
          <Text variant="footnote" weight="semibold" tone="secondary" testID="whatif-text-nrr-headline">
            {nrr.headline}
          </Text>
          <Disclosure label="Details" testID="whatif-btn-nrr-details">
            <View style={styles.notes}>
              {nrr.legend ? (
                <Text variant="footnote" tone="secondary" testID="whatif-text-nrr-legend">
                  {nrr.legend}
                </Text>
              ) : null}
              {nrr.notes.map((note, position) => (
                <View key={note.key} style={styles.line} testID={`whatif-text-nrr-note-${position + 1}`}>
                  <Text variant="footnote" weight="semibold">
                    {note.headline}
                  </Text>
                  {note.detail ? (
                    <Text variant="footnote" tone="secondary">
                      {note.detail}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Disclosure>
        </Inset>
      ) : null}
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
        <Banner tone="info" message={SIMULATION_NOTICE} testID="whatif-text-banner" />
        <EmptyState icon="trophy" title="Nothing left to simulate" body="Every match is played." testID="whatif-empty" />
      </View>
    );
  }

  return (
    <View>
      <Banner tone="info" message={SIMULATION_NOTICE} testID="whatif-text-banner" />
      <SectionHeader title={`Remaining · ${index.stageName(rows[0].stageId)}`} />
      {rows.map((row) => {
        const chosen = choices.get(row.fixtureId);
        return (
          <ListRow
            key={row.key}
            title={`${row.label} ${row.teamsText}`}
            subtitle={chosen ? choiceText(chosen, row) : undefined}
            trailing={chosen ? { kind: 'chevron' } : { kind: 'value', text: 'Pick result', chevron: true }}
            accessibilityLabel={`${row.label} ${row.teamsText}, ${chosen ? choiceText(chosen, row) : 'no result picked'}`}
            onPress={() => setEditing(row)}
            testID={`whatif-row-${row.matchNumber}`}
          />
        );
      })}
      <Inset top="md" bottom="md" gap="xs">
        <Text variant="footnote" tone="secondary" testID="whatif-text-count">
          {plural(choices.size, 'hypothetical result')}
        </Text>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button label="See outcome" onPress={() => void run()} disabled={choices.size === 0} loading={running} fullWidth testID="whatif-btn-run" />
          </View>
          <Button label="Clear" variant="tertiary" onPress={reset} disabled={choices.size === 0} testID="whatif-btn-reset" />
        </View>
      </Inset>
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
    <TournamentContainer tournamentId={tournamentId} testID="screen-what-if" title="What if…" width="column">
      {(index) => <WhatIfBody index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  result: { marginTop: space.md },
  notes: { gap: space.xs },
  line: { gap: space.xxs },
});
