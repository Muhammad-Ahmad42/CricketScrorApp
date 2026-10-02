import { useEffect } from 'react';
import type { Venue } from '@/domain/types';
import { useTeamLibraryStore } from '@/stores';
import type { VenueLookup } from '../selectors/fixtures';

const EMPTY: readonly Venue[] = [];

export function useLibraryLoaded(): void {
  useEffect(() => {
    void useTeamLibraryStore.getState().load({});
  }, []);
}

export function useVenues(): readonly Venue[] {
  useLibraryLoaded();
  return useTeamLibraryStore((state) => state.venues) ?? EMPTY;
}

export function venueLookup(venues: readonly Venue[]): VenueLookup {
  const names = new Map(venues.map((venue) => [venue.id, venue.name]));
  return (venueId) => names.get(venueId) ?? null;
}
