import { useLocalSearchParams } from 'expo-router';
import { AuditScreen, routeParam } from '@/features/tournament';

export default function TournamentAuditRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <AuditScreen tournamentId={routeParam(tournamentId)} />;
}
