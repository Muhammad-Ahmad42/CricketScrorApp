import { View } from 'react-native';
import type { NrrMode, PointsSystem, TieBreakerKind } from '@/domain/types';
import { Inset, SectionHeader, SegmentedControl, Separator, Stepper, Text } from '@/ui';
import { NRR_MODE_LABEL } from '../labels';
import { TieBreakerChainEditor } from './TieBreakerChainEditor';

export interface CompetitionRulesValue {
  readonly pointsSystem: PointsSystem;
  readonly nrrMode: NrrMode;
  readonly tieBreakers: readonly TieBreakerKind[];
}

export interface RulesEditorProps {
  readonly value: CompetitionRulesValue;
  readonly onChange: (value: CompetitionRulesValue) => void;
  readonly testIDPrefix?: string;
}

const POINT_FIELDS: readonly { readonly key: 'win' | 'tie' | 'noResult' | 'loss'; readonly label: string; readonly id: string }[] = [
  { key: 'win', label: 'Win', id: 'win' },
  { key: 'tie', label: 'Tie', id: 'tie' },
  { key: 'noResult', label: 'No result', id: 'nr' },
  { key: 'loss', label: 'Loss', id: 'loss' },
];

export const NRR_HELP: { readonly [K in NrrMode]: string } = {
  icc: 'All out counts as the full overs.',
  actual_overs: 'Only overs faced count.',
};

export function RulesEditor({ value, onChange, testIDPrefix = 'twiz' }: RulesEditorProps) {
  const points = value.pointsSystem;
  return (
    <View>
      <SectionHeader title="Points" />
      <Inset gap="sm">
        {POINT_FIELDS.map((field) => (
          <Stepper
            key={field.key}
            label={field.label}
            value={points[field.key]}
            min={0}
            max={10}
            onChange={(next) => onChange({ ...value, pointsSystem: { ...points, [field.key]: next } })}
            testID={`${testIDPrefix}-input-points-${field.id}`}
          />
        ))}
        <Text variant="label" tone="secondary">
          Super over tie counts as
        </Text>
        <SegmentedControl
          options={[
            { value: 'win_loss', label: 'Win and loss', testID: `${testIDPrefix}-chip-superover-win` },
            { value: 'tie', label: 'Tie', testID: `${testIDPrefix}-chip-superover-tie` },
          ]}
          value={points.superOverDecidedTie}
          onChange={(superOverDecidedTie) => onChange({ ...value, pointsSystem: { ...points, superOverDecidedTie } })}
          accessibilityLabel="A tie decided by a super over counts as"
        />
      </Inset>
      <Separator />
      <SectionHeader title="Net run rate" />
      <Inset gap="sm">
        <SegmentedControl
          options={[
            { value: 'icc', label: 'ICC', accessibilityLabel: NRR_MODE_LABEL.icc, testID: `${testIDPrefix}-chip-nrr-icc` },
            { value: 'actual_overs', label: 'Actual overs', accessibilityLabel: NRR_MODE_LABEL.actual_overs, testID: `${testIDPrefix}-chip-nrr-actual-overs` },
          ]}
          value={value.nrrMode}
          onChange={(nrrMode) => onChange({ ...value, nrrMode })}
          accessibilityLabel="Net run rate"
        />
        <Text variant="footnote" tone="secondary" testID={`${testIDPrefix}-text-nrr-help`}>
          {NRR_HELP[value.nrrMode]}
        </Text>
      </Inset>
      <Separator />
      <SectionHeader title="Tie-breakers (in order)" />
      <TieBreakerChainEditor chain={value.tieBreakers} onChange={(tieBreakers) => onChange({ ...value, tieBreakers })} testIDPrefix={testIDPrefix} />
    </View>
  );
}
