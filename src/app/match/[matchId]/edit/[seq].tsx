import { useLocalSearchParams } from 'expo-router';
import { EditBallScreen } from '@/features/scorecard/screens/EditBallScreen';

export default function EditBallRoute() {
  const { seq } = useLocalSearchParams<{ seq: string }>();
  return <EditBallScreen seq={Number.parseInt(seq ?? '', 10)} />;
}
