import type { MatchId } from '@/domain/types';
import { ListRow, SectionHeader, Text } from '@/ui';
import { COPY } from '../copy';
import type { RepairVM } from '../selectors/diagnostics';
import { Block } from './Block';

export interface RepairListProps {
  readonly repairs: readonly RepairVM[];
  readonly onOpen: (matchId: MatchId) => void;
}

export function RepairList({ repairs, onOpen }: RepairListProps) {
  return (
    <>
      <SectionHeader title="Matches to repair" />
      {repairs.length === 0 ? (
        <Block compact>
          <Text variant="body" tone="secondary" testID="diag-text-no-repairs">
            {COPY.noRepairs}
          </Text>
        </Block>
      ) : (
        repairs.map((repair, index) => (
          <ListRow
            key={repair.matchId}
            title={repair.title}
            subtitle={repair.detail}
            leading={{ icon: 'circle-alert' }}
            trailing={{ kind: 'chevron' }}
            onPress={() => onOpen(repair.matchId)}
            separator={index < repairs.length - 1}
            accessibilityHint="Opens the ball log of this match"
            testID={repair.testID}
          />
        ))
      )}
    </>
  );
}
