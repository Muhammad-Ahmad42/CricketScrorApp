import { useLocalSearchParams } from 'expo-router';
import { BallLogScreen } from '@/features/scorecard/screens/BallLogScreen';

export default function BallsRoute() {
  const { innings } = useLocalSearchParams<{ innings?: string }>();
  const parsed = innings === undefined ? null : Number.parseInt(innings, 10);
  return <BallLogScreen initialInnings={parsed !== null && Number.isFinite(parsed) ? parsed : null} />;
}
