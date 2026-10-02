import { useLocalSearchParams } from 'expo-router';
import { MatchStackLayout } from '@/features/scoring/screens/MatchStackLayout';

export default function MatchLayout() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <MatchStackLayout matchId={matchId} />;
}
