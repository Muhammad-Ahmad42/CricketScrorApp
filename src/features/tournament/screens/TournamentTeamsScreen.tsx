import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { TeamId, TournamentId } from '@/domain/types';
import { ImpactSheet, plural } from '@/features/shared';
import { Button, ListRow, Sheet, Text, TextField, space, useScreenList } from '@/ui';
import { useTeamLibraryStore } from '@/stores';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { useLibraryLoaded } from '../hooks/useLibrary';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { ActionSheet } from '../sheets/ActionSheet';
import { ReplaceTeamSheet } from '../sheets/ReplaceTeamSheet';
import { WithdrawTeamSheet } from '../sheets/WithdrawTeamSheet';
import { TournamentContainer } from './TournamentContainer';

export interface TournamentTeamsScreenProps {
  readonly tournamentId: TournamentId;
}

interface TeamRowVM {
  readonly teamId: TeamId;
  readonly name: string;
  readonly shortName: string;
  readonly seed: number | null;
  readonly pool: string | null;
  readonly status: 'active' | 'withdrawn' | 'replaced';
  readonly detail: string;
}

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'actions' | 'seed' | 'replace' | 'withdraw'; readonly team: TeamRowVM };

const STATUS_TEXT = { active: null, withdrawn: 'Withdrawn', replaced: 'Replaced' } as const;

function teamRows(index: TournamentIndex): readonly TeamRowVM[] {
  return index.snapshot.teams.map((view) => {
    const entry = index.snapshot.poolEntries.find((candidate) => candidate.side.kind === 'team' && candidate.side.teamId === view.team.id);
    const pool = entry ? index.poolName(entry.poolId) : null;
    const status = view.membership.status;
    const parts = [view.membership.seed === null ? 'No seed' : `Seed ${view.membership.seed}`];
    if (pool) {
      parts.push(pool);
    }
    const statusText = STATUS_TEXT[status];
    if (statusText) {
      parts.push(statusText);
    }
    if (status === 'replaced' && view.membership.replacedByTeamId) {
      parts.push(`by ${index.teamName(view.membership.replacedByTeamId)}`);
    }
    return {
      teamId: view.team.id,
      name: view.team.name,
      shortName: view.team.shortName,
      seed: view.membership.seed,
      pool,
      status,
      detail: parts.join(' · '),
    };
  });
}

function SeedSheet({ team, onClose, onSubmit }: { readonly team: TeamRowVM; readonly onClose: () => void; readonly onSubmit: (seed: number | null) => void }) {
  const [text, setText] = useState(team.seed === null ? '' : String(team.seed));
  const trimmed = text.trim();
  const valid = trimmed.length === 0 || (/^\d+$/.test(trimmed) && Number(trimmed) >= 1);
  return (
    <Sheet
      visible
      title={`Seed for ${team.name}`}
      onClose={onClose}
      testID="sheet-seed"
      footer={<Button label="Review changes" disabled={!valid} onPress={() => onSubmit(trimmed.length === 0 ? null : Number(trimmed))} fullWidth testID="seed-btn-review" />}
    >
      <View style={styles.sheetBody}>
        <TextField label="Seed" value={text} onChangeText={setText} numeric helper="1 is the strongest. Leave empty for no seed." error={valid ? null : 'Enter a whole number from 1.'} testID="seed-input" />
      </View>
    </Sheet>
  );
}

function TeamsBody({ index }: { readonly index: TournamentIndex }) {
  useLibraryLoaded();
  const library = useTeamLibraryStore((state) => state.teams);
  const flow = useChangeFlow();
  const list = useScreenList();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const rows = teamRows(index);
  const policy = editPolicy(index);
  const locked = policy.removeTeams === 'forbidden' && policy.seeds === 'forbidden';
  const inTournament = new Set(index.snapshot.teams.map((view) => view.team.id));
  const candidates = library
    .filter((team) => team.archivedAt === null && !inTournament.has(team.id))
    .map((team) => ({ key: team.id, title: team.name, subtitle: team.shortName }));
  const close = () => setMode({ kind: 'idle' });
  const active = rows.filter((row) => row.status === 'active').length;

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.teamId}
        ListHeaderComponent={
          <Text variant="headline" style={styles.count} testID="tteams-text-count">
            {plural(active, 'team')}
          </Text>
        }
        renderItem={({ item, index: position }) => (
          <ListRow
            title={item.name}
            subtitle={item.detail}
            leading={{ monogram: item.shortName.slice(0, 3) }}
            disabled={item.status !== 'active'}
            menu={
              item.status === 'active' && !locked
                ? { accessibilityLabel: `Actions for ${item.name}`, onPress: () => setMode({ kind: 'actions', team: item }), testID: `tteams-btn-menu-${position + 1}` }
                : undefined
            }
            testID={`tteams-row-${position + 1}`}
          />
        )}
        initialNumToRender={20}
        windowSize={9}
        onScroll={list.onScroll}
        scrollEventThrottle={list.scrollEventThrottle}
        scrollIndicatorInsets={list.scrollIndicatorInsets}
        contentContainerStyle={list.contentInset}
      />
      <ActionSheet
        visible={mode.kind === 'actions'}
        title={mode.kind === 'idle' ? '' : mode.team.name}
        onClose={close}
        testID="sheet-team-actions"
        actions={
          mode.kind === 'actions'
            ? [
                { key: 'seed', label: 'Change seed…', testID: 'tteams-btn-seed', disabled: policy.seeds === 'forbidden', onPress: () => setMode({ kind: 'seed', team: mode.team }) },
                { key: 'replace', label: 'Replace with…', testID: 'tteams-btn-replace', onPress: () => setMode({ kind: 'replace', team: mode.team }) },
                { key: 'withdraw', label: 'Withdraw…', testID: 'tteams-btn-withdraw', onPress: () => setMode({ kind: 'withdraw', team: mode.team }) },
              ]
            : []
        }
      />
      {mode.kind === 'seed' ? (
        <SeedSheet
          team={mode.team}
          onClose={close}
          onSubmit={(seed) => {
            const team = mode.team;
            close();
            void flow.start({ kind: 'team_seeds_change', seeds: [{ teamId: team.teamId, seed }] }, { successMessage: 'Seed changed' });
          }}
        />
      ) : null}
      {mode.kind === 'replace' ? (
        <ReplaceTeamSheet
          visible
          outName={mode.team.name}
          candidates={candidates}
          onClose={close}
          onSubmit={({ inTeamId, priorResults }) => {
            const team = mode.team;
            close();
            void flow.start({ kind: 'team_replace', outTeamId: team.teamId, inTeamId, inSeed: team.seed, priorResults }, { successMessage: `${team.name} replaced` });
          }}
        />
      ) : null}
      {mode.kind === 'withdraw' ? (
        <WithdrawTeamSheet
          visible
          teamName={mode.team.name}
          onClose={close}
          onSubmit={({ remainingFixtures, expungeResults }) => {
            const team = mode.team;
            close();
            void flow.start({ kind: 'team_withdraw', teamId: team.teamId, remainingFixtures, expungeResults }, { successMessage: `${team.name} withdrawn` });
          }}
        />
      ) : null}
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function TournamentTeamsScreen({ tournamentId }: TournamentTeamsScreenProps) {
  return (
    <TournamentContainer tournamentId={tournamentId} testID="screen-tournament-teams" title="Teams" scroll={false}>
      {(index) => <TeamsBody index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  count: { paddingHorizontal: space.md, paddingVertical: space.sm },
  sheetBody: { gap: space.md },
});
