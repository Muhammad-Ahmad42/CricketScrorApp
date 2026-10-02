import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, TextField, space } from '@/ui';
import { useTeamLibraryStore, useToastStore } from '@/stores';

export interface VenueSheetProps {
  readonly onCreated: (venueId: string) => void;
  readonly onClose: () => void;
}

export function VenueSheet({ onCreated, onClose }: VenueSheetProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
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
    <Sheet
      visible
      title="Add a venue"
      onClose={onClose}
      testID="sheet-venue"
      footer={<Button label="Add venue" size="lg" fullWidth disabled={name.trim() === ''} loading={busy} onPress={() => void create()} testID="venue-submit" />}
    >
      <View style={styles.body}>
        <TextField label="Venue name" value={name} onChangeText={setName} autoCapitalize="words" testID="venue-name" />
        <TextField label="Location (optional)" value={location} onChangeText={setLocation} testID="venue-location" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});
