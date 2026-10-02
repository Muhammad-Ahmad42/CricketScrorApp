import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TeamId } from '@/domain/types';
import { ChoiceList, ReasonField, reasonReady } from '@/features/shared';
import { Button, Sheet, Text, TextField, space } from '@/ui';
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

export function TieResolutionSheet({ visible, title, teams, onClose, onSubmit }: TieResolutionSheetProps) {
  const [order, setOrder] = useState<readonly TeamId[]>(teams.map((team) => team.teamId));
  const [method, setMethod] = useState<'organizer_decision' | 'draw_lots'>('organizer_decision');
  const [seedText, setSeedText] = useState('');
  const [reason, setReason] = useState('');
  const name = (teamId: TeamId) => teams.find((team) => team.teamId === teamId)?.name ?? 'Team';
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
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
        <ChoiceList
          choices={[
            { value: 'organizer_decision', label: 'Organizer decides the order', testID: 'tie-chip-organizer' },
            { value: 'draw_lots', label: 'Draw lots', description: 'A seeded draw decides the order.', testID: 'tie-chip-lots' },
          ]}
          value={method}
          onChange={setMethod}
          accessibilityLabel="How the tie is decided"
        />
        {method === 'draw_lots' ? (
          <TextField label="Seed (optional)" value={seedText} onChangeText={setSeedText} numeric testID="tie-input-seed" />
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
                <Button
                  label="Up"
                  variant="tertiary"
                  size="sm"
                  accessibilityLabel={`Move ${name(teamId)} up`}
                  disabled={position === 0}
                  onPress={() => setOrder(moveInList(order, position, position - 1))}
                  testID={`tie-btn-up-${position + 1}`}
                />
                <Button
                  label="Down"
                  variant="tertiary"
                  size="sm"
                  accessibilityLabel={`Move ${name(teamId)} down`}
                  disabled={position === order.length - 1}
                  onPress={() => setOrder(moveInList(order, position, position + 1))}
                  testID={`tie-btn-down-${position + 1}`}
                />
              </View>
            ))}
          </View>
        )}
        <ReasonField required value={reason} onChange={setReason} testID="tie-input-reason" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  position: { width: 24 },
  name: { flex: 1 },
});
