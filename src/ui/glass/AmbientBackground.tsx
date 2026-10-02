import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlass } from '../theme';

export interface AmbientBackgroundProps {
  readonly testID?: string;
}

export function AmbientBackground({ testID }: AmbientBackgroundProps) {
  const glass = useGlass();
  if (glass.reduced) {
    return null;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
      <LinearGradient
        colors={[glass.ambient.primary, glass.ambient.primaryClear]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[glass.ambient.secondaryClear, glass.ambient.secondary]}
        start={{ x: 0.2, y: 0.45 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
