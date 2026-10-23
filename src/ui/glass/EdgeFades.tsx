import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../primitives/Icon';
import { formatRgb, parseColor, withAlpha } from '../theme';

export const EDGE_FADE_WIDTH = 28;

export interface RowOverflow {
  readonly start: boolean;
  readonly end: boolean;
}

export interface EdgeFadesProps {
  readonly overflow: RowOverflow;
  readonly color: string;
  readonly hintAt?: 'center' | 'top';
  readonly testID?: string;
}

export function EdgeFades({ overflow, color, hintAt = 'center', testID }: EdgeFadesProps) {
  const solid = formatRgb(parseColor(color));
  const place = hintAt === 'top' ? styles.top : null;
  return (
    <>
      {overflow.start ? (
        <View pointerEvents="none" style={[styles.fade, styles.start, place]} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID ? `${testID}-more-start` : undefined}>
          <LinearGradient colors={[solid, withAlpha(solid, 0)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <Icon name="chevron-left" size={16} color="textSecondary" />
        </View>
      ) : null}
      {overflow.end ? (
        <View pointerEvents="none" style={[styles.fade, styles.end, place]} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID ? `${testID}-more-end` : undefined}>
          <LinearGradient colors={[withAlpha(solid, 0), solid]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <Icon name="chevron-right" size={16} color="textSecondary" />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, width: EDGE_FADE_WIDTH, justifyContent: 'center' },
  start: { left: 0, alignItems: 'flex-start' },
  end: { right: 0, alignItems: 'flex-end' },
  top: { justifyContent: 'flex-start', paddingTop: 12 },
});
