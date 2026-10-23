import { useEffect, useRef, useState } from 'react';
import type { NewPlayerInput, RetirementKind, TeamId } from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import { currentInnings } from '@/domain/scoring/replay';
import { formatScore } from '@/domain/scoring/format';
import { eligibleIncomingBatters } from '@/domain/scoring/validate';
import { useLiveMatchStore, useToastStore } from '@/stores';
import { useLatest } from '../hooks/useLatest';
import { useSingleFlight } from '../hooks/useSingleFlight';
import { sendIntent } from '../hooks/actions';
import { teamName } from '../selectors/names';
import { batterOptions, playerOption, reviseTargetOf, selectChangeBowler, selectWicketOptions } from '../selectors/options';
import { AddPlayerSheet } from '../sheets/AddPlayerSheet';
import { ChangeBowlerSheet } from '../sheets/ChangeBowlerSheet';
import { DecideTieSheet } from '../sheets/DecideTieSheet';
import { EndInningsSheet } from '../sheets/EndInningsSheet';
import { EndMatchSheet } from '../sheets/EndMatchSheet';
import { ExtrasSheet } from '../sheets/ExtrasSheet';
import { controlModeOf, selectCrease } from '../selectors/scoreboard';
import { memoizeLast } from '../selectors/memo';
import { MoreSheet, type MoreAction } from '../sheets/MoreSheet';
import { PenaltySheet } from '../sheets/PenaltySheet';
import { RetireSheet } from '../sheets/RetireSheet';
import { ReviseOversSheet } from '../sheets/ReviseOversSheet';
import { SuspendSheet } from '../sheets/SuspendSheet';
import { WicketSheet, type SubmitResult } from '../sheets/WicketSheet';
import type { SheetKind } from './sheetKinds';
import { errorHeadline } from '../selectors/scannable';

const creaseOf = memoizeLast(selectCrease);

export interface RetireTarget {
  readonly playerId: string;
  readonly kind: RetirementKind;
}

export interface SheetsContainerProps {
  readonly sheet: SheetKind | null;
  readonly retireTarget: RetireTarget | null;
  readonly onOpen: (sheet: SheetKind) => void;
  readonly onClose: () => void;
  readonly onMoreAction: (action: MoreAction) => void;
  readonly playInMenu?: boolean;
}

export function SheetsContainer({ sheet, retireTarget, onOpen, onClose, onMoreAction, playInMenu = false }: SheetsContainerProps) {
  const live = useLiveMatchStore((s) => s.live);
  const canRedo = useLiveMatchStore((s) => s.redoStack.length > 0);
  const padHidden = useLiveMatchStore((s) => controlModeOf(s.live) !== 'pad');
  const canSwap = useLiveMatchStore((s) => playInMenu && creaseOf(s.live).canSwap);
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState<{ readonly sheet: SheetKind | null; readonly serial: number }>({ sheet, serial: 0 });
  if (opening.sheet !== sheet) {
    setOpening({ sheet, serial: sheet === null ? opening.serial : opening.serial + 1 });
  }
  const serial = opening.serial;
  const sentFor = useRef<SheetKind | null>(null);
  const flight = useSingleFlight();
  useEffect(() => {
    if (sheet !== null) {
      sentFor.current = null;
    }
  }, [sheet]);
  const setup = live?.setup ?? null;
  const state = live?.state ?? null;
  const innings = state === null ? null : currentInnings(state);
  const inPlay = innings !== null && innings.status === 'in_progress';
  const overKey = innings === null ? null : `${innings.index}:${innings.currentOver?.overIndex ?? innings.overs.length}`;

  const wicketOptions = useLatest(sheet === 'wicket' && setup !== null && state !== null ? selectWicketOptions(setup, state) : null);
  const changeBowler = useLatest(sheet === 'change_bowler' && setup !== null && state !== null ? selectChangeBowler(setup, state) : null);
  const retireData = useLatest(
    sheet === 'retire' && setup !== null && state !== null && innings !== null && innings.strikerId !== null
      ? {
          striker: playerOption(setup, innings.strikerId),
          nonStriker: innings.nonStrikerId === null ? null : playerOption(setup, innings.nonStrikerId),
          next: batterOptions(setup, innings, eligibleIncomingBatters(setup, state)),
        }
      : null,
  );
  const reviseTarget = useLatest(sheet === 'revise' && setup !== null && state !== null ? reviseTargetOf(setup, state) : null);
  const endInnings = useLatest(
    sheet === 'end_innings' && setup !== null && innings !== null
      ? {
          teamName: teamName(setup, innings.battingTeamId),
          scoreText: formatScore(innings.runs, innings.wickets),
          yetToBat: innings.batting.filter((row) => row.status === 'yet_to_bat').map((row) => playerOption(setup, row.playerId)),
        }
      : null,
  );

  const submit = (intent: ScoringIntent) => {
    if (sheet === null || sentFor.current === sheet) {
      return;
    }
    sentFor.current = sheet;
    onClose();
    void sendIntent(intent);
  };
  const submitWicket = async (intent: ScoringIntent): Promise<SubmitResult> => {
    const result = await sendIntent(intent, { quietValidation: true });
    if (result.ok) {
      onClose();
    }
    return result;
  };
  const addPlayer = (teamId: TeamId | null, player: NewPlayerInput, isSubstitute: boolean) => flight(() => addPlayerNow(teamId, player, isSubstitute));
  const addPlayerNow = async (teamId: TeamId | null, player: NewPlayerInput, isSubstitute: boolean) => {
    if (teamId === null) {
      return;
    }
    setAdding(true);
    const ok = await useLiveMatchStore.getState().addSquadPlayer(teamId, { newPlayer: player }, { isSubstitute });
    setAdding(false);
    const toasts = useToastStore.getState();
    if (ok) {
      onClose();
      toasts.show({ kind: 'success', message: `${player.name} added`, action: null });
    } else {
      const error = useLiveMatchStore.getState().error;
      toasts.show({ kind: 'error', message: errorHeadline(error, "Couldn't add the player."), action: null });
      useLiveMatchStore.getState().clearError();
    }
  };

  if (setup === null) {
    return null;
  }
  const teams = setup.teams.map((team) => ({ id: team.id, name: team.name, shortName: team.shortName }));
  const battingTeamId = innings?.battingTeamId ?? null;
  const bowlingTeamId = innings?.bowlingTeamId ?? null;

  return (
    <>
      <ExtrasSheet visible={sheet === 'extras'} rules={setup.rules} overKey={overKey} onSubmit={submit} onClose={onClose} onPenalty={() => onOpen('penalty')} />
      {wicketOptions ? <WicketSheet key={`wicket-${serial}`} visible={sheet === 'wicket'} options={wicketOptions} onSubmit={submitWicket} onClose={onClose} /> : null}
      <MoreSheet visible={sheet === 'more'} scope="play" playActive={inPlay} canRedo={canRedo} onAction={onMoreAction} onClose={onClose} />
      <MoreSheet
        visible={sheet === 'match_menu'}
        scope={playInMenu ? 'all' : 'match'}
        playActive={inPlay}
        withPlay={padHidden}
        canRedo={canRedo}
        canSwap={canSwap}
        onAction={onMoreAction}
        onClose={onClose}
      />
      {changeBowler ? <ChangeBowlerSheet key={`change-bowler-${serial}`} visible={sheet === 'change_bowler'} vm={changeBowler} onSubmit={submit} onClose={onClose} /> : null}
      {retireData ? (
        <RetireSheet
          key={`retire-${serial}`}
          visible={sheet === 'retire'}
          striker={retireData.striker}
          nonStriker={retireData.nonStriker}
          nextBatters={retireData.next}
          initialPlayerId={retireTarget?.playerId ?? null}
          initialKind={retireTarget?.kind}
          onSubmit={submit}
          onClose={onClose}
        />
      ) : null}
      {battingTeamId !== null ? (
        <PenaltySheet key={`penalty-${serial}`} visible={sheet === 'penalty'} teams={teams} defaultTeamId={battingTeamId} onSubmit={submit} onClose={onClose} />
      ) : null}
      <SuspendSheet key={`suspend-${serial}`} visible={sheet === 'suspend'} onSubmit={submit} onClose={onClose} />
      {reviseTarget ? <ReviseOversSheet key={`revise-${reviseTarget.inningsIndex}-${serial}`} visible={sheet === 'revise'} target={reviseTarget} onSubmit={submit} onClose={onClose} /> : null}
      {endInnings ? (
        <EndInningsSheet
          key={`end-innings-${serial}`}
          visible={sheet === 'end_innings'}
          teamName={endInnings.teamName}
          scoreText={endInnings.scoreText}
          yetToBat={endInnings.yetToBat}
          onSubmit={submit}
          onClose={onClose}
        />
      ) : null}
      <DecideTieSheet key={`decide-tie-${serial}`} visible={sheet === 'decide_tie'} teams={teams} onSubmit={submit} onClose={onClose} />
      <EndMatchSheet key={`end-match-${serial}`} visible={sheet === 'end_match'} teams={teams} inTournament={live?.match.tournamentId !== null} onSubmit={submit} onClose={onClose} />
      <AddPlayerSheet
        key={`add-batter-${serial}`}
        visible={sheet === 'add_batter'}
        teamName={teamName(setup, battingTeamId)}
        busy={adding}
        onSubmit={(player) => void addPlayer(battingTeamId, player, false)}
        onClose={onClose}
      />
      <AddPlayerSheet
        key={`add-bowler-${serial}`}
        visible={sheet === 'add_bowler'}
        teamName={teamName(setup, bowlingTeamId)}
        allowSubstitute
        busy={adding}
        onSubmit={(player, isSubstitute) => void addPlayer(bowlingTeamId, player, isSubstitute)}
        onClose={onClose}
      />
    </>
  );
}
