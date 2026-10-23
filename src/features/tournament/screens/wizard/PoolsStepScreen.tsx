import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { distributePoolSizes, type PoolAssignment } from '@/domain/tournament/pools';
import type { FixtureSide, Pool, PoolId, Seed, StageSlot } from '@/domain/types';
import { plural } from '@/features/shared';
import { Banner, Button, Dialog, EmptyState, Inset, ListRow, SectionHeader, Separator, Sheet, Stepper, Text, TextField, space, useLayoutClass } from '@/ui';
import { useTeamLibraryStore, useTournamentWizardStore } from '@/stores';
import { PoolBoard, type PoolBoardPool } from '../../components/PoolBoard';
import { showToast } from '../../hooks/toast';
import { useLibraryLoaded } from '../../hooks/useLibrary';
import { freshSeed, newId } from '../../ids';
import { REPEAT_DRAW_LABEL } from '../../labels';
import { letterFor } from '../../selectors/names';
import {
  addToPool,
  assignmentHasMembers,
  blockingWarnings,
  drawRandom,
  drawSeeded,
  emptyAssignment,
  parseSeed,
  reconcileAssignment,
  removeFromPools,
  swapInAssignment,
  unassignedMembers,
  warningsFor,
} from '../../selectors/poolDraw';
import { sameSide, sideKey, type PoolMemberVM } from '../../selectors/pools';
import { ActionSheet, type SheetAction } from '../../sheets/ActionSheet';
import { PickerSheet } from '../../sheets/PickerSheet';
import { poolStage, stagePools, withPoolCount } from '../../wizard/structure';
import { WizardFrame } from './WizardFrame';

type Method = 'random' | 'seeded' | 'manual';

type Pending =
  | { readonly kind: 'draw'; readonly method: Method; readonly seed: Seed | null }
  | { readonly kind: 'count'; readonly count: number }
  | null;

type MemberMenu =
  | { readonly kind: 'assigned'; readonly member: PoolMemberVM; readonly poolId: PoolId }
  | { readonly kind: 'unassigned'; readonly member: PoolMemberVM }
  | { readonly kind: 'swap'; readonly member: PoolMemberVM; readonly poolId: PoolId }
  | null;

interface Arrangement {
  readonly assignment: PoolAssignment | null;
  readonly caption: string | null;
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
}

export const UNEVEN_HEADLINE = 'Uneven pools';
export const UNEVEN_SUPPORTING = 'Some teams play more matches than others.';
const REPLACE_WARNING = 'Current pool arrangement will be replaced.';
const SEEDED_CAPTION = 'Drawn by seed';
const MANUAL_CAPTION = 'Placed by hand';
const ADJUSTED_CAPTION = 'Adjusted by hand';

export function randomCaption(seed: Seed): string {
  return `Random draw · no. ${seed}`;
}

function setAssignment(assignment: PoolAssignment): void {
  useTournamentWizardStore.getState().update({ poolAssignment: assignment, fixturePlan: null });
}

function singlePoolAssignment(pool: Pool, entrants: readonly FixtureSide[]): PoolAssignment {
  return { seed: null, pools: [{ poolId: pool.id, name: pool.name, members: entrants }] };
}

function entrantsOf(teams: readonly { readonly teamId: string }[]): readonly FixtureSide[] {
  return teams.map((team) => ({ kind: 'team', teamId: team.teamId }));
}

export function PoolsStepScreen() {
  useLibraryLoaded();
  const library = useTeamLibraryStore((state) => state.teams);
  const draft = useTournamentWizardStore((state) => state.draft);
  const [seedText, setSeedText] = useState('');
  const [repeating, setRepeating] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [previous, setPrevious] = useState<Arrangement | null>(null);
  const [caption, setCaption] = useState<string | null>(typeof draft.poolAssignment?.seed === 'number' ? randomCaption(draft.poolAssignment.seed) : null);
  const [menu, setMenu] = useState<MemberMenu>(null);
  const layout = useLayoutClass();
  const stackMethods = layout.width === 'compact-s' || layout.largeText;
  const stage = poolStage(draft.stages, draft.pools);
  const pools = stage ? stagePools(draft.pools, stage.id) : [];
  const shells = pools.map((pool) => ({ poolId: pool.id, name: pool.name }));
  const entrants = entrantsOf(draft.teams);
  const assignment = reconcileAssignment(draft.poolAssignment, shells);
  const names = new Map(library.map((team) => [team.id, team.name]));
  const nameOf = (side: FixtureSide) => (side.kind === 'team' ? names.get(side.teamId) ?? 'Team' : 'Slot');
  const memberOf = (side: FixtureSide): PoolMemberVM => ({ key: sideKey(side), side, label: nameOf(side), detail: null, isSlot: side.kind === 'slot', teamId: side.kind === 'team' ? side.teamId : null });

  useEffect(() => {
    const current = useTournamentWizardStore.getState().draft;
    const target = poolStage(current.stages, current.pools);
    if (!target) {
      return;
    }
    const single = stagePools(current.pools, target.id);
    if (single.length === 1 && !assignmentHasMembers(current.poolAssignment)) {
      setAssignment(singlePoolAssignment(single[0], entrantsOf(current.teams)));
    }
  }, []);

  if (!stage) {
    return (
      <WizardFrame step="pools">
        <EmptyState title="No pools in this format" body="Teams go straight into the first stage." testID="twiz-text-no-pools" />
      </WizardFrame>
    );
  }

  const warnings = warningsFor(assignment, entrants);
  const blocking = blockingWarnings(warnings);
  const sizes = distributePoolSizes(entrants.length, Math.max(1, pools.length));
  const uneven = new Set(sizes).size > 1 || warnings.some((warning) => warning.code === 'UNEVEN_POOLS');
  const unassigned = unassignedMembers(assignment, entrants);
  const arranged = pools.length > 1 && assignmentHasMembers(draft.poolAssignment);

  const snapshotArrangement = (): Arrangement => {
    const current = useTournamentWizardStore.getState().draft;
    return { assignment: current.poolAssignment, caption, pools: current.pools, slots: current.slots };
  };

  const restore = (arrangement: Arrangement) => {
    useTournamentWizardStore.getState().update({
      pools: arrangement.pools,
      slots: arrangement.slots,
      poolAssignment: arrangement.assignment,
      fixturePlan: null,
    });
    setCaption(arrangement.caption);
    setPrevious(null);
    showToast('info', 'Previous pools restored');
  };

  const remember = (before: Arrangement | null, message: string) => {
    setPrevious(before);
    if (before) {
      showToast('success', message, { label: 'Undo', run: () => restore(before) });
    }
  };

  const apply = (method: Method, seed: Seed | null) => {
    const before = assignmentHasMembers(draft.poolAssignment) ? snapshotArrangement() : null;
    let next: PoolAssignment;
    let message: string;
    if (method === 'random') {
      const drawSeed = seed ?? freshSeed();
      next = drawRandom(entrants, shells, drawSeed);
      message = `Pools drawn (no. ${drawSeed})`;
      setCaption(randomCaption(drawSeed));
    } else if (method === 'seeded') {
      next = drawSeeded(
        draft.teams.map((team) => ({ teamId: team.teamId, seed: team.seed, name: names.get(team.teamId) ?? team.teamId })),
        shells,
      );
      message = 'Pools drawn by seed';
      setCaption(SEEDED_CAPTION);
    } else {
      next = emptyAssignment(shells);
      message = 'Pools cleared';
      setCaption(MANUAL_CAPTION);
    }
    setAssignment(next);
    remember(before, message);
  };

  const applyCount = (count: number, before: Arrangement | null) => {
    const current = useTournamentWizardStore.getState().draft;
    const next = withPoolCount({ stages: current.stages, pools: current.pools, slots: current.slots }, stage.id, count, current.teams.length, newId);
    const nextPools = stagePools(next.pools, stage.id);
    let poolAssignment: PoolAssignment | null = before ? null : current.poolAssignment;
    if (nextPools.length === 1) {
      poolAssignment = singlePoolAssignment(nextPools[0], entrantsOf(current.teams));
    }
    useTournamentWizardStore.getState().update({ pools: next.pools, slots: next.slots, poolAssignment, fixturePlan: null });
    if (before) {
      setCaption(null);
    }
    remember(before, `${plural(nextPools.length, 'pool')}. Assign the teams again.`);
  };

  const request = (method: Method, seedInput: string = '') => {
    const seed = method === 'random' ? parseSeed(seedInput) : null;
    if (assignmentHasMembers(draft.poolAssignment)) {
      setPending({ kind: 'draw', method, seed });
      return;
    }
    apply(method, seed);
  };

  const changeCount = (count: number) => {
    if (count === pools.length) {
      return;
    }
    if (arranged) {
      setPending({ kind: 'count', count });
      return;
    }
    applyCount(count, null);
  };

  const edit = (next: PoolAssignment) => {
    setAssignment(next);
    setPrevious(null);
    setCaption((current) => (current === null || current === MANUAL_CAPTION ? MANUAL_CAPTION : ADJUSTED_CAPTION));
  };

  const boardPools: readonly PoolBoardPool[] = assignment.pools.map((pool, index) => ({
    poolId: pool.poolId,
    key: letterFor(index),
    name: pool.name,
    summary: plural(pool.members.length, 'team'),
    members: pool.members.map(memberOf),
  }));

  const memberActions = (): readonly SheetAction[] => {
    if (menu === null || menu.kind === 'swap') {
      return [];
    }
    const targets = boardPools.filter((pool) => menu.kind === 'unassigned' || pool.poolId !== menu.poolId);
    const moves: SheetAction[] = targets.map((pool) => ({
      key: pool.poolId,
      label: menu.kind === 'unassigned' ? `Add to ${pool.name}` : `Move to ${pool.name}`,
      testID: `pools-btn-target-${pool.key}`,
      onPress: () => {
        edit(addToPool(assignment, menu.member.side, pool.poolId));
        setMenu(null);
      },
    }));
    if (menu.kind === 'unassigned') {
      return moves;
    }
    return [
      ...moves,
      { key: 'swap', label: 'Swap with…', testID: 'pools-btn-swap', onPress: () => setMenu({ kind: 'swap', member: menu.member, poolId: menu.poolId }) },
      {
        key: 'remove',
        label: 'Remove from pool',
        testID: 'pools-btn-unassign',
        onPress: () => {
          edit(removeFromPools(assignment, menu.member.side));
          setMenu(null);
        },
      },
    ];
  };

  const boardHeader = (
    <View>
      <Inset top="sm" bottom="sm">
        <View style={styles.countLine}>
          <View style={styles.flex}>
            <Stepper
              label="Pools"
              value={pools.length}
              min={1}
              max={Math.max(1, Math.floor(entrants.length / 2))}
              onChange={changeCount}
              testID="twiz-input-pool-count"
            />
          </View>
          <View style={styles.sizes} accessible accessibilityLabel={`Teams per pool: ${sizes.join(', ')}`}>
            <Text variant="label" tone="secondary">
              Teams per pool
            </Text>
            <Text variant="callout" testID="twiz-text-pool-sizes">
              {sizes.join(' · ')}
            </Text>
          </View>
        </View>
      </Inset>
      {uneven ? <Banner tone="warning" message={UNEVEN_HEADLINE} supporting={UNEVEN_SUPPORTING} testID="twiz-text-uneven-warning" /> : null}
      <Inset top="sm" gap="sm">
        <Text variant="label" tone="secondary" accessibilityRole="header">
          Draw the pools
        </Text>
        <View style={stackMethods ? styles.methodsStacked : styles.methods}>
          <View style={stackMethods ? null : styles.method}>
            <Button label="Random" variant="secondary" onPress={() => request('random')} fullWidth accessibilityLabel="Random draw" testID="twiz-btn-pools-random" />
          </View>
          <View style={stackMethods ? null : styles.method}>
            <Button label="By seed" variant="secondary" onPress={() => request('seeded')} fullWidth accessibilityLabel="Draw by team seeds" testID="twiz-btn-pools-seeded" />
          </View>
          <View style={stackMethods ? null : styles.method}>
            <Button label="By hand" variant="secondary" onPress={() => request('manual')} fullWidth accessibilityLabel="Place teams by hand" testID="twiz-btn-pools-manual" />
          </View>
        </View>
        {caption ? (
          <Text variant="footnote" tone="secondary" testID="twiz-text-pool-seed">
            {caption}
          </Text>
        ) : null}
        <View style={styles.links}>
          <Button label={REPEAT_DRAW_LABEL} variant="tertiary" size="sm" onPress={() => setRepeating(true)} testID="twiz-btn-repeat-draw" />
          {previous ? <Button label="Restore previous" variant="tertiary" size="sm" onPress={() => restore(previous)} testID="twiz-btn-restore-pools" /> : null}
        </View>
      </Inset>
    </View>
  );

  const boardFooter = (
    <View>
      {unassigned.length > 0 ? (
        <View>
          <Separator />
          <SectionHeader title={`Unassigned (${unassigned.length})`} />
          {unassigned.map((side, index) => {
            const member = memberOf(side);
            return (
              <ListRow
                key={member.key}
                title={member.label}
                trailing={{ kind: 'value', text: 'Add to pool', chevron: true }}
                onPress={() => setMenu({ kind: 'unassigned', member })}
                compact
                testID={`pools-row-unassigned-${index + 1}`}
              />
            );
          })}
        </View>
      ) : null}
      {warnings
        .filter((warning) => warning.code !== 'UNEVEN_POOLS' && warning !== blocking[0])
        .filter((warning, index, all) => all.findIndex((other) => other.message === warning.message) === index)
        .map((warning, index) => (
          <Inset key={`${warning.code}-${index}`} top="sm">
            <Text variant="footnote" tone={blocking.includes(warning) ? 'danger' : 'warning'}>
              {warning.message}
            </Text>
          </Inset>
        ))}
    </View>
  );

  return (
    <WizardFrame step="pools" scroll={false} nextDisabled={blocking.length > 0} nextHint={blocking[0]?.message ?? null}>
      <PoolBoard
        pools={boardPools}
        rowTestIDPrefix="twiz-row-pool"
        onMemberActions={(member, pool) => setMenu({ kind: 'assigned', member, poolId: pool.poolId })}
        header={boardHeader}
        footer={boardFooter}
        testID="twiz-list-pools"
      />
      <ActionSheet
        visible={menu !== null && menu.kind !== 'swap'}
        title={menu?.member.label ?? ''}
        actions={memberActions()}
        onClose={() => setMenu(null)}
        testID="sheet-pool-member"
      />
      <PickerSheet
        visible={menu?.kind === 'swap'}
        title="Swap with"
        subtitle={menu?.member.label}
        options={
          menu?.kind === 'swap'
            ? boardPools
                .filter((pool) => pool.poolId !== menu.poolId)
                .flatMap((pool) => pool.members.map((member) => ({ key: member.key, title: member.label, subtitle: pool.name })))
            : []
        }
        testIDPrefix="pools-swap"
        onClose={() => setMenu(null)}
        onPick={(key) => {
          if (menu?.kind === 'swap') {
            const other = boardPools.flatMap((pool) => pool.members).find((member) => member.key === key);
            if (other && !sameSide(other.side, menu.member.side)) {
              edit(swapInAssignment(assignment, menu.member.side, other.side));
            }
          }
          setMenu(null);
        }}
      />
      <Sheet
        visible={repeating}
        title={REPEAT_DRAW_LABEL}
        onClose={() => setRepeating(false)}
        testID="sheet-repeat-draw"
        footer={
          <Button
            label="Draw pools"
            disabled={parseSeed(seedText) === null}
            onPress={() => {
              setRepeating(false);
              request('random', seedText);
            }}
            fullWidth
            testID="twiz-btn-repeat-draw-confirm"
          />
        }
      >
        <TextField
          label="Draw number"
          value={seedText}
          onChangeText={setSeedText}
          numeric
          placeholder="847291"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (parseSeed(seedText) !== null) {
              setRepeating(false);
              request('random', seedText);
            }
          }}
          testID="twiz-input-pool-seed"
        />
      </Sheet>
      <Dialog
        visible={pending !== null}
        title={pending?.kind === 'count' ? 'Change pool count?' : 'Re-draw pools?'}
        message={REPLACE_WARNING}
        messageTestID="twiz-text-replace-warning"
        cancel={{ label: 'Cancel', onPress: () => setPending(null) }}
        confirm={{
          label: 'Replace',
          onPress: () => {
            if (pending?.kind === 'draw') {
              apply(pending.method, pending.seed);
            } else if (pending?.kind === 'count') {
              applyCount(pending.count, snapshotArrangement());
            }
            setPending(null);
          },
        }}
        onRequestClose={() => setPending(null)}
        testID="dialog-replace-pools"
      />
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  countLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  methods: { flexDirection: 'row', gap: space.xs },
  methodsStacked: { gap: space.xs },
  method: { flex: 1, minWidth: 0 },
  sizes: { alignItems: 'flex-end', gap: space.xxs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
