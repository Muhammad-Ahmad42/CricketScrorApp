import { router } from 'expo-router';
import { useTournamentWizardStore } from '@/stores';

export function openMatch(matchId: string, inPlay: boolean): void {
  router.push({ pathname: inPlay ? '/match/[matchId]/score' : '/match/[matchId]/scorecard', params: { matchId } });
}

export function openTournament(tournamentId: string, inSetup: boolean): void {
  if (inSetup) {
    void useTournamentWizardStore.getState().resume(tournamentId);
    router.push('/tournament/new');
    return;
  }
  router.push({ pathname: '/tournament/[tournamentId]', params: { tournamentId } });
}

export function createTournament(): void {
  useTournamentWizardStore.getState().reset();
  router.push('/tournament/new');
}
