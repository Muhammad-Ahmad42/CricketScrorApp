import { useLocalSearchParams } from 'expo-router';
import { StageDetailScreen, routeParam } from '@/features/tournament';

export default function TournamentStageRoute() {
  const { tournamentId, stageId } = useLocalSearchParams<{ tournamentId: string; stageId: string }>();
  return <StageDetailScreen tournamentId={routeParam(tournamentId)} stageId={routeParam(stageId)} />;
}
