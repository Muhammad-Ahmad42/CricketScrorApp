import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MatchRules, PowerplayRule, SuperOverTieBreak } from '@/domain/types';
import { Button, IconButton, ListRow, RadioList, SegmentedControl, Sheet, Stepper, Text, TextField, space } from '@/ui';
import { QUOTA_LABEL, RULE_TITLE, type RuleKey } from '../selectors/rules';

export interface RuleSheetProps {
  readonly ruleKey: RuleKey | null;
  readonly rules: MatchRules;
  readonly onDone: (rules: MatchRules) => void;
  readonly onClose: () => void;
}

const TIE_AGAIN: readonly { readonly value: SuperOverTieBreak; readonly label: string; readonly testID: string }[] = [
  { value: 'repeat', label: 'Another super over', testID: 'rule-super-again-repeat' },
  { value: 'boundary_count', label: 'Boundary count', testID: 'rule-super-again-boundary' },
  { value: 'tie_stands', label: 'Tie stands', testID: 'rule-super-again-stands' },
];

const PENALTIES = ['0', '1', '2'] as const;

function switchRow(title: string, value: boolean, onChange: (value: boolean) => void, testID: string, subtitle?: string) {
  return <ListRow title={title} subtitle={subtitle} trailing={{ kind: 'switch', value, onValueChange: onChange }} testID={testID} />;
}

function PowerplayEditor({ phases, overs, onChange }: { readonly phases: readonly PowerplayRule[]; readonly overs: number; readonly onChange: (phases: readonly PowerplayRule[]) => void }) {
  const update = (index: number, patch: Partial<PowerplayRule>) => onChange(phases.map((phase, position) => (position === index ? { ...phase, ...patch } : phase)));
  return (
    <View style={styles.list}>
      {phases.map((phase, index) => (
        <View key={`phase-${index}`} style={styles.phase}>
          <View style={styles.phaseHeader}>
            <View style={styles.flex}>
              <TextField label="Name" value={phase.name} onChangeText={(name) => update(index, { name })} testID={`rule-powerplay-name-${index}`} />
            </View>
            <IconButton icon="trash-2" tone="danger" accessibilityLabel={`Remove ${phase.name}`} onPress={() => onChange(phases.filter((_, position) => position !== index))} testID={`rule-powerplay-remove-${index}`} />
          </View>
          <Stepper label="From over" value={phase.fromOver} min={1} max={overs} onChange={(fromOver) => update(index, { fromOver })} testID={`rule-powerplay-from-${index}`} />
          <Stepper label="To over" value={phase.toOver} min={1} max={overs} onChange={(toOver) => update(index, { toOver })} testID={`rule-powerplay-to-${index}`} />
        </View>
      ))}
      <Button
        label="Add powerplay"
        icon="plus"
        variant="tertiary"
        size="sm"
        onPress={() => {
          const start = Math.min(overs, (phases[phases.length - 1]?.toOver ?? 0) + 1);
          onChange([...phases, { name: `Powerplay ${phases.length + 1}`, fromOver: start, toOver: start }]);
        }}
        testID="rule-powerplay-add"
      />
    </View>
  );
}

function RuleBody({ ruleKey, draft, setDraft }: { readonly ruleKey: RuleKey; readonly draft: MatchRules; readonly setDraft: (rules: MatchRules) => void }) {
  switch (ruleKey) {
    case 'players':
      return <Stepper label="Players per side" value={draft.playersPerSide} min={2} max={15} onChange={(playersPerSide) => setDraft({ ...draft, playersPerSide })} testID="rule-players" />;
    case 'ballsPerOver':
      return <Stepper label="Balls per over" value={draft.ballsPerOver} min={1} max={12} onChange={(ballsPerOver) => setDraft({ ...draft, ballsPerOver })} testID="rule-balls" />;
    case 'bowlerMax':
      return (
        <View style={styles.list}>
          {switchRow('No limit', draft.maxOversPerBowler === null, (none) => setDraft({ ...draft, maxOversPerBowler: none ? null : Math.max(1, Math.ceil(draft.oversPerInnings / 5)) }), 'rule-bowler-unlimited')}
          {draft.maxOversPerBowler !== null ? (
            <Stepper
              label="Max overs per bowler"
              value={draft.maxOversPerBowler}
              min={1}
              max={Math.max(1, draft.oversPerInnings)}
              onChange={(maxOversPerBowler) => setDraft({ ...draft, maxOversPerBowler })}
              testID="rule-bowler-max"
            />
          ) : null}
        </View>
      );
    case 'bowlerQuota':
      return (
        <RadioList
          choices={[
            { value: 'uniform', label: QUOTA_LABEL.uniform, testID: 'rule-quota-uniform' },
            { value: 'icc_one_fifth', label: QUOTA_LABEL.icc_one_fifth, testID: 'rule-quota-icc' },
          ]}
          value={draft.bowlerQuotaMode}
          onChange={(bowlerQuotaMode) => setDraft({ ...draft, bowlerQuotaMode })}
          accessibilityLabel="Bowler quota"
        />
      );
    case 'consecutive':
      return switchRow('Allow back-to-back overs', draft.allowBowlerConsecutiveOvers, (allowBowlerConsecutiveOvers) => setDraft({ ...draft, allowBowlerConsecutiveOvers }), 'rule-consecutive');
    case 'wide':
      return (
        <View style={styles.list}>
          <Text variant="subhead" tone="secondary">
            Runs for a wide
          </Text>
          <SegmentedControl
            options={PENALTIES.map((value) => ({ value, label: value, testID: `rule-wide-${value}` }))}
            value={`${draft.wide.penaltyRuns}`}
            onChange={(value) => setDraft({ ...draft, wide: { ...draft.wide, penaltyRuns: Number(value) } })}
            accessibilityLabel="Runs for a wide"
          />
          {switchRow('Counts as a ball', draft.wide.countsAsBall, (countsAsBall) => setDraft({ ...draft, wide: { ...draft.wide, countsAsBall } }), 'rule-wide-counts')}
        </View>
      );
    case 'noBall':
      return (
        <View style={styles.list}>
          <Text variant="subhead" tone="secondary">
            Runs for a no-ball
          </Text>
          <SegmentedControl
            options={PENALTIES.map((value) => ({ value, label: value, testID: `rule-noball-${value}` }))}
            value={`${draft.noBall.penaltyRuns}`}
            onChange={(value) => setDraft({ ...draft, noBall: { ...draft.noBall, penaltyRuns: Number(value) } })}
            accessibilityLabel="Runs for a no-ball"
          />
          {switchRow('Free hit after a no-ball', draft.noBall.freeHit, (freeHit) => setDraft({ ...draft, noBall: { ...draft.noBall, freeHit } }), 'rule-noball-free-hit')}
          {switchRow('Counts as a ball', draft.noBall.countsAsBall, (countsAsBall) => setDraft({ ...draft, noBall: { ...draft.noBall, countsAsBall } }), 'rule-noball-counts')}
        </View>
      );
    case 'powerplay':
      return <PowerplayEditor phases={draft.powerplays} overs={draft.oversPerInnings} onChange={(powerplays) => setDraft({ ...draft, powerplays })} />;
    case 'superOver': {
      const superOver = draft.superOver;
      const set = (patch: Partial<MatchRules['superOver']>) => setDraft({ ...draft, superOver: { ...superOver, ...patch } });
      return (
        <View style={styles.list}>
          {switchRow('Play a super over if tied', superOver.enabled, (enabled) => set({ enabled }), 'rule-super-enabled')}
          {superOver.enabled ? (
            <>
              <Stepper label="Overs" value={superOver.overs} min={1} max={5} onChange={(overs) => set({ overs })} testID="rule-super-overs" />
              <Stepper label="Max wickets" value={superOver.maxWickets} min={1} max={10} onChange={(maxWickets) => set({ maxWickets })} testID="rule-super-wickets" />
              <Text variant="subhead" tone="secondary">
                If tied again
              </Text>
              <RadioList choices={TIE_AGAIN} value={superOver.ifTiedAgain} onChange={(ifTiedAgain) => set({ ifTiedAgain })} accessibilityLabel="If tied again" />
              {switchRow('Limit the rounds', superOver.maxRounds !== null, (limited) => set({ maxRounds: limited ? 3 : null }), 'rule-super-limit')}
              {superOver.maxRounds !== null ? (
                <Stepper label="Max rounds" value={superOver.maxRounds} min={1} max={10} onChange={(maxRounds) => set({ maxRounds })} testID="rule-super-rounds" />
              ) : null}
              {switchRow('ICC player restrictions', superOver.restrictRepeatPlayers, (restrictRepeatPlayers) => set({ restrictRepeatPlayers }), 'rule-super-restrict')}
            </>
          ) : null}
        </View>
      );
    }
    case 'lastManStands':
      return switchRow('Last batter may bat alone', draft.lastManStands, (lastManStands) => setDraft({ ...draft, lastManStands }), 'rule-lms');
    case 'retirement': {
      const retirement = draft.mandatoryRetirement;
      return (
        <View style={styles.list}>
          {switchRow('Batters must retire', retirement !== null, (on) => setDraft({ ...draft, mandatoryRetirement: on ? { atRuns: 30, mayReturn: true, timing: 'end_of_over' } : null }), 'rule-retire-on')}
          {retirement !== null ? (
            <>
              <Stepper label="Retire at runs" value={retirement.atRuns} min={1} max={300} onChange={(atRuns) => setDraft({ ...draft, mandatoryRetirement: { ...retirement, atRuns } })} testID="rule-retire-runs" />
              {switchRow('May return later', retirement.mayReturn, (mayReturn) => setDraft({ ...draft, mandatoryRetirement: { ...retirement, mayReturn } }), 'rule-retire-return')}
              <SegmentedControl
                options={[
                  { value: 'immediately', label: 'Immediately', testID: 'rule-retire-now' },
                  { value: 'end_of_over', label: 'End of over', testID: 'rule-retire-over' },
                ]}
                value={retirement.timing}
                onChange={(timing) => setDraft({ ...draft, mandatoryRetirement: { ...retirement, timing } })}
                accessibilityLabel="When to retire"
              />
            </>
          ) : null}
        </View>
      );
    }
    default: {
      const unreachable: never = ruleKey;
      return unreachable;
    }
  }
}

export function rulesChanged(before: MatchRules, after: MatchRules): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function RuleSheet({ ruleKey, rules, onDone, onClose }: RuleSheetProps) {
  const [draft, setDraft] = useState<MatchRules>(rules);
  if (ruleKey === null) {
    return null;
  }
  const changed = rulesChanged(rules, draft);
  const keep = () => (changed ? onDone(draft) : onClose());
  return (
    <Sheet
      visible
      title={RULE_TITLE[ruleKey]}
      onClose={keep}
      closeLabel={changed ? 'Keep changes and close' : 'Close'}
      testID="sheet-rule"
      footer={
        <View style={styles.footer}>
          {changed ? (
            <View style={styles.flex}>
              <Button label="Discard" variant="secondary" size="lg" fullWidth onPress={onClose} testID="rule-discard" />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button label="Done" size="lg" fullWidth onPress={keep} testID="rule-done" />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <RuleBody ruleKey={ruleKey} draft={draft} setDraft={setDraft} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  list: { gap: space.sm },
  phase: { gap: space.xs },
  phaseHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: space.xs },
});
