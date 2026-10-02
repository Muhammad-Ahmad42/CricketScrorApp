import type { MatchEventOf, MatchSetup } from '../../../types';
import { thawInnings, type StateDraft } from '../draft';
import { inProgressInnings } from '../eligibility';
import {
  assignPosition,
  enterLoneModeIfDue,
  lastLegalBallLabel,
  putInnings,
  recordWicket,
  setPositions,
  updateBattingRow,
  vacate,
} from '../innings';
import { closePartnership, startPartnershipIfReady } from '../partnerships';

export function applyBatterIn(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'batter_in'>): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  assignPosition(setup, innings, event.playerId);
  updateBattingRow(innings, event.playerId, (row) => {
    row.returnedFromRetirement = row.returnedFromRetirement || row.status === 'retired_hurt' || row.status === 'retired_not_out';
    row.status = 'not_out';
    row.dismissalText = 'not out';
  });
  if (event.position === 'striker') {
    setPositions(innings, event.playerId, innings.nonStrikerId);
  } else {
    setPositions(innings, innings.strikerId, event.playerId);
  }
  startPartnershipIfReady(setup, innings, event.playerId);
  putInnings(state, innings);
}

export function applyStrikeSwapped(state: StateDraft): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  setPositions(innings, current.nonStrikerId, current.strikerId);
  putInnings(state, innings);
}

export function applyBatterRetired(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'batter_retired'>): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  if (event.retirement === 'retired_out') {
    recordWicket(setup, innings, {
      type: 'retired_out',
      playerOutId: event.playerId,
      bowlerId: current.bowlerId,
      creditedBowlerId: null,
      fielderIds: [],
      seq: event.seq,
      onDelivery: false,
      overLabel: lastLegalBallLabel(current.legalBalls, setup.rules.ballsPerOver),
    });
    enterLoneModeIfDue(setup, innings);
  } else {
    closePartnership(innings, 'retirement');
    vacate(innings, event.playerId);
    const hurt = event.retirement === 'retired_hurt';
    updateBattingRow(innings, event.playerId, (row) => {
      row.status = hurt ? 'retired_hurt' : 'retired_not_out';
      row.atCrease = null;
      row.dismissalText = hurt ? 'retired hurt' : 'retired not out';
    });
  }
  putInnings(state, innings);
}

export function applyBatterDismissed(setup: MatchSetup, state: StateDraft, event: MatchEventOf<'batter_dismissed'>): void {
  const current = inProgressInnings(state);
  if (current === null) {
    return;
  }
  const innings = thawInnings(current);
  recordWicket(setup, innings, {
    type: event.type,
    playerOutId: event.playerId,
    bowlerId: current.bowlerId,
    creditedBowlerId: null,
    fielderIds: event.fielderIds,
    seq: event.seq,
    onDelivery: false,
    overLabel: lastLegalBallLabel(current.legalBalls, setup.rules.ballsPerOver),
  });
  enterLoneModeIfDue(setup, innings);
  putInnings(state, innings);
}
