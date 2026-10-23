import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, TextField, space, useFormChain } from '@/ui';
import { useTeamLibraryStore, useToastStore } from '@/stores';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';

export interface VenueSheetProps {
  readonly onCreated: (venueId: string) => void;
  readonly onClose: () => void;
}

export function VenueSheet({ onCreated, onClose }: VenueSheetProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim() !== '';
  const guard = useDiscardGuard(name.trim() !== '' || location.trim() !== '', onClose);
  const chain = useFormChain(['name', 'location'] as const, { onSubmit: () => (valid && !busy ? void create() : undefined) });
  const create = async () => {
    setBusy(true);
    const venue = await useTeamLibraryStore.getState().createVenue({ name: name.trim(), location: location.trim() === '' ? null : location.trim() });
    setBusy(false);
    if (venue === null) {
      useToastStore.getState().show({ kind: 'error', message: "Couldn't add the venue.", action: null });
      return;
    }
    onCreated(venue.id);
  };
  return (
    <>
      <Sheet
        visible={!guard.asking}
        title="Add a venue"
        onClose={guard.requestClose}
        testID="sheet-venue"
        footer={<Button label="Add venue" size="lg" fullWidth disabled={!valid} loading={busy} onPress={() => void create()} testID="venue-submit" />}
      >
        <View style={styles.body}>
          <TextField {...chain.field('name')} label="Venue name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus testID="venue-name" />
          <TextField {...chain.field('location')} label="Location (optional)" value={location} onChangeText={setLocation} autoCapitalize="words" testID="venue-location" />
        </View>
      </Sheet>
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});
