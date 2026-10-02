import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Player } from '@/domain/types';
import { Button, Dialog, ErrorState, ListRow, Screen, SectionHeader, Skeleton, Text, space } from '@/ui';
import { useTeamLibraryStore, useToastStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { InsetBody } from '@/features/scoring/components/common/InsetBody';
import { useSingleFlight } from '@/features/scoring/hooks/useSingleFlight';
import { selectPlayerRows } from '../selectors';
import { PlayerSheet, type PlayerValues } from '../sheets/PlayerSheet';
import { TeamSheet, type TeamValues } from '../sheets/TeamSheet';

export interface TeamDetailScreenProps {
  readonly teamId: string;
}

type Overlay = { readonly kind: 'edit' } | { readonly kind: 'add' } | { readonly kind: 'player'; readonly player: Player } | { readonly kind: 'archive' } | null;

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/teams');
  }
}

export function TeamDetailScreen({ teamId }: TeamDetailScreenProps) {
  const detail = useTeamLibraryStore((s) => (s.detail?.team.id === teamId ? s.detail : null));
  const status = useTeamLibraryStore((s) => s.status);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [busy, setBusy] = useState(false);
  const flight = useSingleFlight();

  useEffect(() => {
    void useTeamLibraryStore.getState().loadTeam(teamId);
  }, [teamId]);

  const run = async (action: () => Promise<boolean>, success: string): Promise<boolean> => {
    let outcome = false;
    await flight(async () => {
      outcome = await runNow(action, success);
    });
    return outcome;
  };
  const runNow = async (action: () => Promise<boolean>, success: string): Promise<boolean> => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    const toasts = useToastStore.getState();
    if (ok) {
      setOverlay(null);
      toasts.show({ kind: 'success', message: success, action: null });
      return true;
    }
    const error = useTeamLibraryStore.getState().error;
    useTeamLibraryStore.getState().clearError();
    toasts.show({ kind: 'error', message: error?.message ?? "Couldn't save the change.", action: null });
    return false;
  };

  if (detail === null) {
    return (
      <Screen testID="screen-team" scroll={false} header={<TopBar title="Team" onBack={goBack} />}>
        <InsetBody>
          {status === 'error' ? (
            <ErrorState title="Couldn't open this team" onRetry={() => void useTeamLibraryStore.getState().loadTeam(teamId)} testID="team-error" />
          ) : (
            <Skeleton rows={4} testID="team-loading" />
          )}
        </InsetBody>
      </Screen>
    );
  }

  const { team, players } = detail;
  const active = players.filter((player) => player.archivedAt === null);
  const rows = selectPlayerRows(team, players);
  const captain = players.find((player) => player.id === team.captainId)?.name ?? null;
  const store = () => useTeamLibraryStore.getState();

  const saveTeam = (values: TeamValues) =>
    void run(() => store().updateTeam({ ...team, name: values.name, shortName: values.shortName, captainId: values.captainId }), 'Team saved');
  const addPlayer = (values: PlayerValues) =>
    void run(async () => (await store().addPlayer(team.id, { name: values.name, jerseyNumber: values.jerseyNumber, role: values.role })) !== null, `${values.name} added`);
  const savePlayer = (player: Player, values: PlayerValues) =>
    void run(() => store().updatePlayer({ ...player, name: values.name, jerseyNumber: values.jerseyNumber, role: values.role }), 'Player saved');
  const archiveTeam = async () => {
    const ok = await run(() => store().archiveTeam(team.id), `${team.name} archived`);
    if (ok) {
      goBack();
    }
  };

  return (
    <Screen
      testID="screen-team"
      header={
        <TopBar
          title={team.name}
          subtitle={`Short name ${team.shortName}${captain ? ` · Captain ${captain}` : ''}`}
          onBack={goBack}
          trailing={<Button label="Edit" variant="tertiary" size="sm" onPress={() => setOverlay({ kind: 'edit' })} testID="team-btn-edit" />}
        />
      }
    >
      <SectionHeader title={`Players (${active.length})`} action={{ label: '+ Add player', onPress: () => setOverlay({ kind: 'add' }), testID: 'team-btn-add-player' }} />
      {rows.length === 0 ? (
        <Text variant="body" tone="secondary" style={styles.empty}>
          No players yet. Add the squad once and pick from it for every match.
        </Text>
      ) : null}
      {rows.map((row) => {
        const player = players.find((entry) => entry.id === row.id);
        return (
          <ListRow
            key={row.id}
            title={`${row.jersey ? `${row.jersey}  ` : ''}${row.name}`}
            subtitle={row.archived ? `${row.role} · Archived` : row.role}
            trailing={row.captain ? { kind: 'badge', badge: { label: 'C', tone: 'outline' } } : { kind: 'chevron' }}
            accessibilityLabel={row.accessibilityLabel}
            disabled={row.archived}
            onPress={player === undefined || row.archived ? undefined : () => setOverlay({ kind: 'player', player })}
            testID={`team-player-${row.id}`}
          />
        );
      })}
      {team.archivedAt === null ? (
        <View style={styles.archive}>
          <Button label="Archive team" variant="destructive" size="lg" fullWidth onPress={() => setOverlay({ kind: 'archive' })} testID="team-btn-archive" />
        </View>
      ) : null}
      {overlay?.kind === 'edit' ? (
        <TeamSheet
          visible
          title="Edit team"
          initial={{ name: team.name, shortName: team.shortName, captainId: team.captainId }}
          players={active}
          busy={busy}
          submitLabel="Save team"
          onSubmit={saveTeam}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.kind === 'add' ? (
        <PlayerSheet visible title="Add player" initial={{ name: '', jerseyNumber: null, role: 'unknown' }} busy={busy} onSubmit={addPlayer} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay?.kind === 'player' ? (
        <PlayerSheet
          key={overlay.player.id}
          visible
          title={overlay.player.name}
          initial={{ name: overlay.player.name, jerseyNumber: overlay.player.jerseyNumber, role: overlay.player.role }}
          busy={busy}
          onSubmit={(values) => savePlayer(overlay.player, values)}
          onArchive={() => void run(() => store().archivePlayer(overlay.player.id), `${overlay.player.name} archived`)}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      <Dialog
        visible={overlay?.kind === 'archive'}
        destructive
        title={`Archive ${team.name}?`}
        message="Archived teams stay in past scorecards and tournaments but are hidden from pickers."
        confirm={{ label: 'Archive team', onPress: () => void archiveTeam(), testID: 'team-archive-confirm' }}
        cancel={{ label: 'Cancel', onPress: () => setOverlay(null) }}
        onRequestClose={() => setOverlay(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: space.md, paddingVertical: space.sm },
  archive: { padding: space.md },
});
