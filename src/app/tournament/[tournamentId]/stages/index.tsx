import { useLocalSearchParams } from 'expo-router';
import { StagesScreen, routeParam } from '@/features/tournament';

export default function TournamentStagesRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <StagesScreen tournamentId={routeParam(tournamentId)} />;
}
