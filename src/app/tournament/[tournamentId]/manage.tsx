import { useLocalSearchParams } from 'expo-router';
import { ManageTournamentScreen, routeParam } from '@/features/tournament';

export default function TournamentManageRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <ManageTournamentScreen tournamentId={routeParam(tournamentId)} />;
}
