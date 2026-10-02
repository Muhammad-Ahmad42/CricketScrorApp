import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTheme, type ColorToken } from '../theme';
import { Icon } from './Icon';

export type RowMarker = 'striker' | 'bowler' | 'none';

export interface MarkerProps {
  readonly color?: ColorToken;
  readonly testID?: string;
}

export function StrikerMarker({ color = 'accent', testID }: MarkerProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 5,
        borderBottomWidth: 5,
        borderLeftWidth: 9,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: theme.color[color],
      }}
    />
  );
}

export function BowlerMarker({ color = 'textPrimary', testID }: MarkerProps) {
  return (
    <View testID={testID} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Icon name="circle-dot" size={16} color={color} />
    </View>
  );
}

export function RowMarkerGlyph({ marker }: { readonly marker: RowMarker }) {
  if (marker === 'striker') {
    return <StrikerMarker />;
  }
  if (marker === 'bowler') {
    return <BowlerMarker />;
  }
  return <View style={{ width: 10 }} />;
}

export interface StumpsGlyphProps {
  readonly size?: number;
  readonly color?: ColorToken;
}

export function StumpsGlyph({ size = 20, color = 'danger' }: StumpsGlyphProps) {
  const theme = useTheme();
  const ink = theme.color[color];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Rect x={3} y={3} width={14} height={2} rx={1} fill={ink} />
        <Line x1={5} y1={7} x2={5} y2={19} stroke={ink} strokeWidth={2} strokeLinecap="round" />
        <Line x1={10} y1={7} x2={10} y2={19} stroke={ink} strokeWidth={2} strokeLinecap="round" />
        <Line x1={15} y1={7} x2={15} y2={19} stroke={ink} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
