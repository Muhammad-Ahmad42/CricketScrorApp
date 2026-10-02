import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/ui';
import { SetupPlayersProvider } from '../context/SetupPlayersContext';

export function MatchSetupLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <SetupPlayersProvider>
      <Stack screenOptions={screenOptions} />
    </SetupPlayersProvider>
  );
}
