import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BUILTIN_FORMAT_PRESETS, OVERS_QUICK_PICKS, rulesForOvers, validateRules } from '@/domain/scoring/presets';
import type { MatchRules, TournamentRules } from '@/domain/types';
import { Button, SectionHeader, Separator, Text, TextField, space } from '@/ui';
import { useTournamentWizardStore } from '@/stores';
import { RulesEditor } from '../../components/RulesEditor';
import { nowIso } from '../../ids';
import { defaultRules } from '../../wizard/structure';
import { rulesErrors } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

function formatIdFor(rules: MatchRules): string {
  const preset = BUILTIN_FORMAT_PRESETS.find((candidate) => candidate.rules.oversPerInnings === rules.oversPerInnings);
  return preset ? preset.id : 'custom';
}

function setRules(rules: TournamentRules): void {
  useTournamentWizardStore.getState().update({ rules });
}

export function RulesStepScreen() {
  const draftRules = useTournamentWizardStore((state) => state.draft.rules);
  const tournamentId = useTournamentWizardStore((state) => state.draft.tournamentId);
  const rules = draftRules ?? defaultRules(tournamentId ?? '', nowIso());
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
      <SectionHeader title={`Match format · ${rules.defaultFormatId === 'custom' ? 'Custom' : rules.defaultFormatId} · ${overs} overs`} />
      <View style={styles.padded}>
        <View style={styles.chips}>
          {OVERS_QUICK_PICKS.map((value) => (
            <Button
              key={value}
              label={String(value)}
              variant={value === overs ? 'primary' : 'secondary'}
              size="sm"
              accessibilityLabel={`${value} overs${value === overs ? ', selected' : ''}`}
              onPress={() => setOvers(value)}
              testID={`twiz-chip-overs-${value}`}
            />
          ))}
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
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
              testID="twiz-input-overs-custom"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Players per side"
              value={players}
              onChangeText={(text) => {
                setPlayers(text);
                const value = Number(text);
                if (/^\d+$/.test(text) && value >= 2 && value <= 15) {
                  setMatchRules({ ...rules.defaultMatchRules, playersPerSide: value });
                }
              }}
              numeric
              error={/^\d+$/.test(players) && Number(players) >= 2 && Number(players) <= 15 ? null : 'From 2 to 15.'}
              testID="twiz-input-players-per-side"
            />
          </View>
        </View>
        {warnings.map((warning) => (
          <Text key={warning.code} variant="footnote" tone="warning">
            {warning.message}
          </Text>
        ))}
        {errors.map((error) => (
          <Text key={error} variant="footnote" tone="danger">
            {error}
          </Text>
        ))}
      </View>
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: space.md, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
