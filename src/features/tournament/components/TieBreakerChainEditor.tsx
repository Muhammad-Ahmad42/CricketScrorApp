import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { tieBreakerLabel } from '@/domain/tournament/tiebreakers';
import { TIE_BREAKER_KINDS, type TieBreakerKind } from '@/domain/types';
import { Button, IconButton, Inset, Separator, Text, space, useGutter } from '@/ui';
import { moveInList } from '../selectors/overrides';
import { PickerSheet } from '../sheets/PickerSheet';

export interface TieBreakerChainEditorProps {
  readonly chain: readonly TieBreakerKind[];
  readonly onChange: (chain: readonly TieBreakerKind[]) => void;
  readonly testIDPrefix?: string;
}

export function TieBreakerChainEditor({ chain, onChange, testIDPrefix = 'twiz' }: TieBreakerChainEditorProps) {
  const gutter = useGutter();
  const [adding, setAdding] = useState(false);
  const available = TIE_BREAKER_KINDS.filter((kind) => !chain.includes(kind));
  return (
    <View>
      {chain.map((kind, position) => {
        const fixed = position === 0 && kind === 'points';
        const label = tieBreakerLabel(kind);
        return (
          <View key={kind}>
            <View
              style={[styles.row, { paddingLeft: gutter, paddingRight: fixed ? gutter : Math.max(space.xxs, gutter - space.sm) }]}
              testID={`${testIDPrefix}-row-tiebreaker-${position + 1}`}
              accessible={false}
            >
              <Text variant="tableNumeric" tone="secondary" style={styles.position}>
                {String(position + 1)}
              </Text>
              <Text variant="body" style={styles.label} testID={`${testIDPrefix}-text-tiebreaker-${position + 1}`}>
                {label}
              </Text>
              {fixed ? (
                <Text variant="footnote" tone="secondary">
                  Always first
                </Text>
              ) : (
                <>
                  <IconButton
                    icon="chevron-up"
                    disabled={position <= 1}
                    accessibilityLabel={`Move ${label} up`}
                    onPress={() => onChange(moveInList(chain, position, position - 1))}
                    testID={`${testIDPrefix}-btn-tiebreaker-up-${position + 1}`}
                  />
                  <IconButton
                    icon="chevron-down"
                    disabled={position === chain.length - 1}
                    accessibilityLabel={`Move ${label} down`}
                    onPress={() => onChange(moveInList(chain, position, position + 1))}
                    testID={`${testIDPrefix}-btn-tiebreaker-down-${position + 1}`}
                  />
                  <IconButton
                    icon="x"
                    accessibilityLabel={`Remove ${label}`}
                    onPress={() => onChange(chain.filter((candidate) => candidate !== kind))}
                    testID={`${testIDPrefix}-btn-tiebreaker-remove-${position + 1}`}
                  />
                </>
              )}
            </View>
            <Separator inset={gutter} />
          </View>
        );
      })}
      <Inset top="xs">
        <View style={styles.start}>
          <Button
            label="Add tie-breaker"
            icon="plus"
            variant="tertiary"
            size="sm"
            disabled={available.length === 0}
            onPress={() => setAdding(true)}
            testID={`${testIDPrefix}-btn-tiebreaker-add`}
          />
        </View>
      </Inset>
      <PickerSheet
        visible={adding}
        title="Add tie-breaker"
        options={available.map((kind) => ({ key: kind, title: tieBreakerLabel(kind) }))}
        testIDPrefix="tiebreaker-picker"
        onClose={() => setAdding(false)}
        onPick={(key) => {
          const kind = TIE_BREAKER_KINDS.find((candidate) => candidate === key);
          if (kind) {
            onChange([...chain, kind]);
          }
          setAdding(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 48 },
  position: { minWidth: space.lg },
  label: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
});
