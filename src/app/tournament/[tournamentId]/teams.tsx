import { useLocalSearchParams } from 'expo-router';
import { TournamentTeamsScreen, routeParam } from '@/features/tournament';

export default function TournamentTeamsRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <TournamentTeamsScreen tournamentId={routeParam(tournamentId)} />;
}
