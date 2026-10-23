import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { ReasonField, reasonReady } from '@/features/shared';
import { Button, Disclosure, IconButton, RadioList, Sheet, Text, TextField, space, useFormChain } from '@/ui';
import { REPEAT_DRAW_LABEL } from '../labels';
import { moveInList } from '../selectors/overrides';
import { parseSeed } from '../selectors/poolDraw';

export interface TieResolutionSubmit {
  readonly orderedTeamIds: readonly TeamId[];
  readonly method: 'organizer_decision' | 'draw_lots';
  readonly seed: number | null;
  readonly reason: string;
}

export interface TieResolutionSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly teams: readonly { readonly teamId: TeamId; readonly name: string }[];
  readonly onClose: () => void;
  readonly onSubmit: (value: TieResolutionSubmit) => void;
}

const FIELDS = ['seed', 'reason'] as const;

export function TieResolutionSheet({ visible, title, teams, onClose, onSubmit }: TieResolutionSheetProps) {
  const [order, setOrder] = useState<readonly TeamId[]>(teams.map((team) => team.teamId));
  const [method, setMethod] = useState<'organizer_decision' | 'draw_lots'>('organizer_decision');
  const [seedText, setSeedText] = useState('');
  const [reason, setReason] = useState('');
  const chain = useFormChain(FIELDS);
  const name = (teamId: TeamId) => teams.find((team) => team.teamId === teamId)?.name ?? 'Team';
  const reordered = order.some((teamId, position) => teams[position]?.teamId !== teamId);
  const guard = useDiscardGuard(reason.trim() !== '' || seedText.trim() !== '' || method !== 'organizer_decision' || reordered, onClose);
  return (
    <>
      <Sheet
        visible={visible && !guard.asking}
        title={title}
        onClose={guard.requestClose}
        testID="sheet-tie-resolution"
        footer={
          <Button
            label="Review changes"
            disabled={!reasonReady(reason)}
            onPress={() => onSubmit({ orderedTeamIds: order, method, seed: method === 'draw_lots' ? parseSeed(seedText) : null, reason: reason.trim() })}
            fullWidth
            testID="tie-btn-apply"
          />
        }
      >
        <View style={styles.body}>
          <RadioList
            choices={[
              { value: 'organizer_decision', label: 'Organizer decides the order', testID: 'tie-chip-organizer' },
              { value: 'draw_lots', label: 'Draw lots', testID: 'tie-chip-lots' },
            ]}
            value={method}
            onChange={setMethod}
            accessibilityLabel="How the tie is decided"
          />
          {method === 'draw_lots' ? (
            <Disclosure label={REPEAT_DRAW_LABEL} defaultExpanded={seedText !== ''} testID="tie-btn-repeat-draw">
              <TextField label="Draw number" value={seedText} onChangeText={setSeedText} numeric {...chain.field('seed')} testID="tie-input-seed" />
            </Disclosure>
          ) : (
            <View>
              {order.map((teamId, position) => (
                <View key={teamId} style={styles.row}>
                  <Text variant="tableNumeric" style={styles.position}>
                    {String(position + 1)}
                  </Text>
                  <Text variant="body" style={styles.name}>
                    {name(teamId)}
                  </Text>
                  <IconButton
                    icon="chevron-up"
                    accessibilityLabel={`Move ${name(teamId)} up`}
                    disabled={position === 0}
                    onPress={() => setOrder(moveInList(order, position, position - 1))}
                    testID={`tie-btn-up-${position + 1}`}
                  />
                  <IconButton
                    icon="chevron-down"
                    accessibilityLabel={`Move ${name(teamId)} down`}
                    disabled={position === order.length - 1}
                    onPress={() => setOrder(moveInList(order, position, position + 1))}
                    testID={`tie-btn-down-${position + 1}`}
                  />
                </View>
              ))}
            </View>
          )}
          <ReasonField required value={reason} onChange={setReason} chain={{ ...chain.field('reason'), returnKeyType: 'default', submitBehavior: 'newline' }} testID="tie-input-reason" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  position: { minWidth: space.lg },
  name: { flex: 1, minWidth: 0 },
});
