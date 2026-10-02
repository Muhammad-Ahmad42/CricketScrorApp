import { useLocalSearchParams } from 'expo-router';
import { MatchInfoStep } from '@/features/match-setup/screens/MatchInfoStep';

export default function NewMatchRoute() {
  const { tournamentId, fixtureId } = useLocalSearchParams<{ tournamentId?: string; fixtureId?: string }>();
  return <MatchInfoStep tournamentId={tournamentId ?? null} fixtureId={fixtureId ?? null} />;
}
