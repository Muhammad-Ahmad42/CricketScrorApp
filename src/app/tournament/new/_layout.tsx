import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/ui';

export default function TournamentWizardLayout() {
  const screenOptions = useStackScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}
