import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BUILTIN_FORMAT_PRESETS, OVERS_QUICK_PICKS, rulesForOvers, validateRules } from '@/domain/scoring/presets';
import type { MatchRules, TournamentRules } from '@/domain/types';
import { ChipGroup, Inset, SectionHeader, Separator, Text, TextField, space, useFormChain, useLayoutClass } from '@/ui';
import { useTournamentWizardStore } from '@/stores';
import { plural } from '@/features/shared';
import { RulesEditor } from '../../components/RulesEditor';
import { nowIso } from '../../ids';
import { defaultRules } from '../../wizard/structure';
import { rulesErrors } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

type RulesField = 'overs' | 'players';

export const RULES_FIELDS: readonly RulesField[] = ['overs', 'players'];

function formatIdFor(rules: MatchRules): string {
  const preset = BUILTIN_FORMAT_PRESETS.find((candidate) => candidate.rules.oversPerInnings === rules.oversPerInnings);
  return preset ? preset.id : 'custom';
}

function setRules(rules: TournamentRules): void {
  useTournamentWizardStore.getState().update({ rules });
}

export function playersError(text: string): string | null {
  return /^\d+$/.test(text) && Number(text) >= 2 && Number(text) <= 15 ? null : 'From 2 to 15.';
}

export function RulesStepScreen() {
  const draftRules = useTournamentWizardStore((state) => state.draft.rules);
  const tournamentId = useTournamentWizardStore((state) => state.draft.tournamentId);
  const rules = draftRules ?? defaultRules(tournamentId ?? '', nowIso());
  const layout = useLayoutClass();
  const chain = useFormChain(RULES_FIELDS);
  const [customOvers, setCustomOvers] = useState('');
  const [players, setPlayers] = useState(String(rules.defaultMatchRules.playersPerSide));

  useEffect(() => {
    if (useTournamentWizardStore.getState().draft.rules === null) {
      setRules(rules);
    }
  }, [rules]);

  const errors = rulesErrors(rules);
  const warnings = validateRules(rules.defaultMatchRules).filter((issue) => issue.severity === 'warning');
  const overs = rules.defaultMatchRules.oversPerInnings;
  const side = layout.width === 'medium' || layout.width === 'expanded';

  const setMatchRules = (matchRules: MatchRules) =>
    setRules({ ...rules, defaultMatchRules: matchRules, defaultFormatId: formatIdFor(matchRules) });

  const setOvers = (value: number) => setMatchRules(rulesForOvers(value, rules.defaultMatchRules));

  return (
    <WizardFrame step="rules" nextDisabled={errors.length > 0} nextHint={errors[0] ?? null}>
      <RulesEditor
        value={{ pointsSystem: rules.pointsSystem, nrrMode: rules.nrr.mode, tieBreakers: rules.tieBreakers }}
        onChange={(value) => setRules({ ...rules, pointsSystem: value.pointsSystem, nrr: { ...rules.nrr, mode: value.nrrMode }, tieBreakers: value.tieBreakers })}
      />
      <Separator />
      <SectionHeader title="Match format" />
      <Inset gap="sm" bottom="md">
        <Text variant="label" tone="secondary" accessibilityRole="header">
          Overs per innings
        </Text>
        <ChipGroup
          options={OVERS_QUICK_PICKS.map((value) => ({ value: String(value), label: String(value), accessibilityLabel: plural(value, 'over'), testID: `twiz-chip-overs-${value}` }))}
          value={OVERS_QUICK_PICKS.includes(overs) ? String(overs) : null}
          onChange={(value) => {
            setCustomOvers('');
            setOvers(Number(value));
          }}
          columns={5}
          accessibilityLabel="Overs per innings"
        />
        <View style={side ? styles.pair : styles.stack}>
          <View style={side ? styles.flex : null}>
            <TextField
              label="Other overs"
              value={customOvers}
              onChangeText={(text) => {
                setCustomOvers(text);
                const value = Number(text);
                if (/^\d+$/.test(text) && value >= 1 && value <= 100) {
                  setOvers(value);
                }
              }}
              numeric
              placeholder={OVERS_QUICK_PICKS.includes(overs) ? undefined : String(overs)}
              {...chain.field('overs')}
              testID="twiz-input-overs-custom"
            />
          </View>
          <View style={side ? styles.flex : null}>
            <TextField
              label="Players per side"
              value={players}
              onChangeText={(text) => {
                setPlayers(text);
                const value = Number(text);
                if (playersError(text) === null) {
                  setMatchRules({ ...rules.defaultMatchRules, playersPerSide: value });
                }
              }}
              numeric
              error={playersError(players)}
              {...chain.field('players')}
              testID="twiz-input-players-per-side"
            />
          </View>
        </View>
        {warnings.map((warning) => (
          <Text key={warning.code} variant="footnote" tone="warning">
            {warning.message}
          </Text>
        ))}
        {errors.slice(1).map((error) => (
          <Text key={error} variant="footnote" tone="danger">
            {error}
          </Text>
        ))}
      </Inset>
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.sm },
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
});
