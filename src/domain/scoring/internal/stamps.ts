import type { DeliveryPayload, InningsState } from '../../types';

export function stampsMatch(innings: InningsState, delivery: Pick<DeliveryPayload, 'strikerId' | 'nonStrikerId' | 'bowlerId'>): boolean {
  return (
    delivery.strikerId === innings.strikerId &&
    delivery.nonStrikerId === innings.nonStrikerId &&
    delivery.bowlerId === innings.bowlerId
  );
}
