import { useLocalSearchParams } from 'expo-router';
import { TeamDetailScreen } from '@/features/teams/screens/TeamDetailScreen';

export default function TeamRoute() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  return <TeamDetailScreen teamId={teamId ?? ''} />;
}
