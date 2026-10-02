import { useLocalSearchParams } from 'expo-router';
import { BracketScreen, routeParam } from '@/features/tournament';

export default function TournamentBracketRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <BracketScreen tournamentId={routeParam(tournamentId)} />;
}
