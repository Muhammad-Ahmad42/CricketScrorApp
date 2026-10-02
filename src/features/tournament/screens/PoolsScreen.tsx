import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PoolAssignment } from '@/domain/tournament/pools';
import type { PoolId, StageId, TournamentId } from '@/domain/types';
import { ImpactSheet, Notice } from '@/features/shared';
import { Button, Dialog, EmptyState, SegmentedControl, Sheet, Text, TextField, space, useScreenList } from '@/ui';
import { useTeamLibraryStore } from '@/stores';
import { PoolBoard } from '../components/PoolBoard';
import { showToast } from '../hooks/toast';
import { useChangeFlow, type ChangeBuilder } from '../hooks/useChangeFlow';
import { useLibraryLoaded } from '../hooks/useLibrary';
import { freshSeed, newId } from '../ids';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy } from '../selectors/policy';
import { drawRandom, parseSeed } from '../selectors/poolDraw';
import { assignmentFromSnapshot, poolMoveChange, poolsReplaceChange, sameSide, stagePoolsVM, stagesWithPools, type PoolMemberVM } from '../selectors/pools';
import { ActionSheet } from '../sheets/ActionSheet';
import { PickerSheet } from '../sheets/PickerSheet';
import { ReplaceTeamSheet } from '../sheets/ReplaceTeamSheet';
import { TournamentContainer } from './TournamentContainer';

export interface PoolsScreenProps {
  readonly tournamentId: TournamentId;
}

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'actions'; readonly member: PoolMemberVM; readonly poolId: PoolId }
  | { readonly kind: 'move'; readonly member: PoolMemberVM; readonly poolId: PoolId }
  | { readonly kind: 'swap'; readonly member: PoolMemberVM; readonly poolId: PoolId }
  | { readonly kind: 'replace'; readonly member: PoolMemberVM }
  | { readonly kind: 'redraw' }
  | { readonly kind: 'confirm-redraw'; readonly seedText: string };

const IDLE: Mode = { kind: 'idle' };

function poolsStage(index: TournamentIndex, selected: StageId | null): StageId | null {
  const stageIds = stagesWithPools(index);
  return selected ?? stageIds.find((candidate) => candidate === index.evaluation?.currentStageId) ?? stageIds[0] ?? null;
}

function PoolsStagePicker({ index, stageId, onChange }: { readonly index: TournamentIndex; readonly stageId: StageId | null; readonly onChange: (stageId: StageId) => void }) {
  const stageIds = stagesWithPools(index);
  if (stageId === null || stageIds.length <= 1) {
    return null;
  }
  return (
    <View style={styles.picker}>
      <SegmentedControl
        options={stageIds.map((candidate) => ({ value: candidate, label: index.stageName(candidate) }))}
        value={stageId}
        onChange={onChange}
        accessibilityLabel="Stage"
      />
    </View>
  );
}

function PoolsBody({ index, stageId }: { readonly index: TournamentIndex; readonly stageId: StageId | null }) {
  useLibraryLoaded();
  const libraryTeams = useTeamLibraryStore((state) => state.teams);
  const flow = useChangeFlow();
  const list = useScreenList();
  const [mode, setMode] = useState<Mode>(IDLE);
  const [seedText, setSeedText] = useState('');
  if (stageId === null) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <EmptyState icon="trophy" title="No pools" body="This tournament has no stage with pools." testID="pools-empty" />
      </View>
    );
  }
  const policy = editPolicy(index);
  const locked = policy.pools === 'forbidden';
  const pools = stagePoolsVM(index, stageId);
  const close = () => setMode(IDLE);

  const startChange = (build: ChangeBuilder, successMessage: string, onApplied?: () => void) => {
    close();
    void flow.start(build, { successMessage, onApplied });
  };

  const redraw = (text: string) => {
    const seed = parseSeed(text) ?? freshSeed();
    let previous: PoolAssignment | null = null;
    startChange(
      (fresh) => {
        const current = assignmentFromSnapshot(fresh, stageId);
        previous = current;
        const members = current.pools.flatMap((pool) => pool.members);
        const sizes = current.pools.map((pool) => pool.members.length);
        const drawn = drawRandom(members, current.pools.map((pool) => ({ poolId: pool.poolId, name: pool.name })), seed, sizes);
        return poolsReplaceChange(stageId, drawn);
      },
      `Pools drawn (seed ${seed})`,
      () => {
        if (previous) {
          offerUndo(previous);
        }
      },
    );
  };

  const offerUndo = (previous: PoolAssignment) => {
    showToast('success', 'Pools re-drawn', {
      label: 'Undo',
      run: () => {
        void flow.start(poolsReplaceChange(stageId, previous), { successMessage: 'Previous pools restored' });
      },
    });
  };

  const memberOptions = (exclude: PoolId) =>
    pools
      .filter((pool) => pool.poolId !== exclude)
      .flatMap((pool) => pool.members.map((member) => ({ key: member.key, title: member.label, subtitle: pool.name, member })));

  const tournamentTeamIds = new Set(index.snapshot.teams.map((view) => view.team.id));
  const replaceCandidates = libraryTeams
    .filter((team) => !tournamentTeamIds.has(team.id) && team.archivedAt === null)
    .map((team) => ({ key: team.id, title: team.name, subtitle: team.shortName }));

  const boardHeader = (
    <View>
      {locked ? (
        <Notice tone="info" message="Pools can't be changed any more in this tournament." testID="pools-text-locked" />
      ) : (
        <View style={styles.padded}>
          <Button label="Re-draw pools" variant="secondary" icon="arrow-left-right" onPress={() => setMode({ kind: 'redraw' })} testID="pools-btn-redraw" />
          <Text variant="footnote" tone="secondary">
            Every change shows what will change before anything is saved. Played matches are never touched.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.fill}>
      <PoolBoard
        pools={pools}
        rowTestIDPrefix="pools-row"
        onMemberActions={locked ? undefined : (member, pool) => setMode({ kind: 'actions', member, poolId: pool.poolId })}
        header={boardHeader}
        testID="pools-list"
      />
      <ActionSheet
        visible={mode.kind === 'actions'}
        title={mode.kind === 'actions' ? mode.member.label : ''}
        onClose={close}
        testID="sheet-member-actions"
        actions={
          mode.kind === 'actions'
            ? [
                { key: 'move', label: 'Move to pool…', icon: 'arrow-left-right', testID: 'pools-btn-move', onPress: () => setMode({ ...mode, kind: 'move' }) },
                { key: 'swap', label: 'Swap with…', icon: 'arrow-left-right', testID: 'pools-btn-swap', onPress: () => setMode({ ...mode, kind: 'swap' }) },
                ...(mode.member.isSlot
                  ? []
                  : [
                      {
                        key: 'replace',
                        label: 'Replace with another team…',
                        icon: 'pencil-line' as const,
                        testID: 'pools-btn-replace',
                        onPress: () => setMode({ kind: 'replace', member: mode.member }),
                      },
                    ]),
              ]
            : []
        }
      />
      <PickerSheet
        visible={mode.kind === 'move'}
        title={mode.kind === 'move' ? `Move ${mode.member.label} to` : ''}
        options={
          mode.kind === 'move'
            ? pools.filter((pool) => pool.poolId !== mode.poolId).map((pool) => ({ key: pool.poolId, title: pool.name, subtitle: `${pool.members.length} teams` }))
            : []
        }
        testIDPrefix="pools-target"
        onClose={close}
        onPick={(poolId) => {
          if (mode.kind === 'move') {
            const member = mode.member;
            startChange((fresh) => poolMoveChange(fresh, stageId, member.side, poolId, newId),`${member.label} moved to ${index.poolName(poolId) ?? 'the pool'}`);
          }
        }}
      />
      <PickerSheet
        visible={mode.kind === 'swap'}
        title={mode.kind === 'swap' ? `Swap ${mode.member.label} with` : ''}
        options={mode.kind === 'swap' ? memberOptions(mode.poolId) : []}
        testIDPrefix="pools-swap"
        onClose={close}
        onPick={(key) => {
          if (mode.kind !== 'swap') {
            return;
          }
          const other = pools.flatMap((pool) => pool.members).find((member) => member.key === key);
          if (!other || sameSide(other.side, mode.member.side)) {
            return;
          }
          const first = mode.member;
          startChange(
            () => ({ kind: 'pool_swap', stageId, memberA: first.side, memberB: other.side }),
            `${first.label} and ${other.label} swapped`,
          );
        }}
      />
      {mode.kind === 'replace' ? (
        <ReplaceTeamSheet
          visible
          outName={mode.member.label}
          candidates={replaceCandidates}
          onClose={close}
          onSubmit={({ inTeamId, priorResults }) => {
            const outTeamId = mode.member.teamId;
            if (outTeamId === null) {
              return;
            }
            startChange(
              () => ({ kind: 'team_replace', outTeamId, inTeamId, inSeed: null, priorResults }),
              `${mode.member.label} replaced`,
            );
          }}
        />
      ) : null}
      <Sheet visible={mode.kind === 'redraw'} title="Re-draw pools" onClose={close} testID="sheet-redraw">
        <View style={styles.sheetBody}>
          <TextField
            label="Seed (optional)"
            value={seedText}
            onChangeText={setSeedText}
            helper="Leave empty for a new random draw. Enter a seed, e.g. 847291, to reproduce a draw."
            numeric
            testID="pools-input-seed"
          />
          <Button label="Draw pools" onPress={() => setMode({ kind: 'confirm-redraw', seedText })} fullWidth testID="pools-btn-draw" />
        </View>
      </Sheet>
      <Dialog
        visible={mode.kind === 'confirm-redraw'}
        title="Re-draw pools?"
        message="Current pool arrangement will be replaced."
        messageTestID="pools-text-replace-warning"
        cancel={{ label: 'Cancel', onPress: close }}
        confirm={{
          label: 'Replace',
          onPress: () => {
            if (mode.kind === 'confirm-redraw') {
              redraw(mode.seedText);
            }
          },
        }}
        onRequestClose={close}
        testID="dialog-replace-pools"
      />
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function PoolsScreen({ tournamentId }: PoolsScreenProps) {
  const [selected, setSelected] = useState<StageId | null>(null);
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-pools"
      title="Pools"
      scroll={false}
      controls={(index) => <PoolsStagePicker index={index} stageId={poolsStage(index, selected)} onChange={setSelected} />}
    >
      {(index) => <PoolsBody index={index} stageId={poolsStage(index, selected)} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs },
  picker: { paddingHorizontal: space.md, paddingBottom: space.xs },
  sheetBody: { gap: space.md },
});
