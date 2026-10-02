import { useLocalSearchParams } from 'expo-router';
import { QualificationScreen, routeParam } from '@/features/tournament';

export default function TournamentQualificationRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <QualificationScreen tournamentId={routeParam(tournamentId)} />;
}
