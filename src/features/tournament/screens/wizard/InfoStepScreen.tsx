import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { isBlank } from '@/features/shared';
import { Button, ListRow, Sheet, Text, TextField, space } from '@/ui';
import { useTeamLibraryStore, useTournamentWizardStore } from '@/stores';
import type { NewTournamentInput } from '@/services/contracts';
import { showError } from '../../hooks/toast';
import { useVenues } from '../../hooks/useLibrary';
import { infoErrors } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

function VenuesSheet({
  visible,
  selected,
  onToggle,
  onClose,
}: {
  readonly visible: boolean;
  readonly selected: readonly string[];
  readonly onToggle: (venueId: string) => void;
  readonly onClose: () => void;
}) {
  const window = useWindowDimensions();
  const venues = useVenues();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    const venue = await useTeamLibraryStore.getState().createVenue({ name: name.trim(), location: null });
    setAdding(false);
    if (venue) {
      setName('');
      onToggle(venue.id);
    } else {
      showError(useTeamLibraryStore.getState().error, "Couldn't add this venue.");
    }
  };
  return (
    <Sheet visible={visible} title="Venues" onClose={onClose} scrollable={false} testID="sheet-venues" footer={<Button label="Done" onPress={onClose} fullWidth testID="twiz-btn-venues-done" />}>
      <View style={styles.sheetBody}>
        <FlatList
          data={venues}
          keyExtractor={(venue) => venue.id}
          style={{ maxHeight: window.height * 0.35 }}
          ListEmptyComponent={
            <Text variant="callout" tone="secondary">
              No venues yet. Add one below.
            </Text>
          }
          renderItem={({ item, index }) => (
            <ListRow
              title={item.name}
              subtitle={item.location ?? undefined}
              trailing={{ kind: 'switch', value: selected.includes(item.id), onValueChange: () => onToggle(item.id) }}
              testID={`twiz-row-venue-${index + 1}`}
            />
          )}
        />
        <View style={styles.addVenue}>
          <View style={styles.flex}>
            <TextField label="New venue" value={name} onChangeText={setName} testID="twiz-input-venue-name" />
          </View>
          <Button label="Add" variant="secondary" disabled={isBlank(name)} loading={adding} onPress={() => void add()} testID="twiz-btn-venue-add" />
        </View>
      </View>
    </Sheet>
  );
}

export function InfoStepScreen() {
  const info = useTournamentWizardStore((state) => state.draft.info);
  const venues = useVenues();
  const [attempted, setAttempted] = useState(false);
  const [venuesOpen, setVenuesOpen] = useState(false);
  const errors = infoErrors(info);
  const shown = attempted ? errors : { name: null, startDate: errors.startDate, endDate: errors.endDate };
  const set = (patch: Partial<NewTournamentInput>) => {
    const current = useTournamentWizardStore.getState().draft.info;
    useTournamentWizardStore.getState().update({ info: { ...current, ...patch } });
  };
  const venueNames = venues.filter((venue) => info.venueIds.includes(venue.id)).map((venue) => venue.name);
  const venueText = venueNames.length === 0 ? 'None' : venueNames.length === 1 ? venueNames[0] : `${venueNames[0]}, +${venueNames.length - 1}`;

  return (
    <WizardFrame
      step="info"
      validate={() => {
        setAttempted(true);
        return errors.name === null && errors.startDate === null && errors.endDate === null;
      }}
    >
      <View style={styles.form}>
        <TextField label="Name" value={info.name} onChangeText={(name) => set({ name })} error={shown.name} autoCapitalize="words" maxLength={80} testID="twiz-input-name" />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField label="Season (optional)" value={info.season ?? ''} onChangeText={(season) => set({ season: season.length === 0 ? null : season })} testID="twiz-input-season" />
          </View>
          <View style={styles.flex}>
            <TextField label="Organizer (optional)" value={info.organizer ?? ''} onChangeText={(organizer) => set({ organizer: organizer.length === 0 ? null : organizer })} testID="twiz-input-organizer" />
          </View>
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <TextField
              label="Starts"
              value={info.startDate ?? ''}
              onChangeText={(startDate) => set({ startDate: startDate.length === 0 ? null : startDate })}
              placeholder="YYYY-MM-DD"
              error={shown.startDate}
              autoCapitalize="none"
              testID="twiz-input-start-date"
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Ends"
              value={info.endDate ?? ''}
              onChangeText={(endDate) => set({ endDate: endDate.length === 0 ? null : endDate })}
              placeholder="YYYY-MM-DD"
              error={shown.endDate}
              autoCapitalize="none"
              testID="twiz-input-end-date"
            />
          </View>
        </View>
        <ListRow title="Venues" trailing={{ kind: 'value', text: venueText, chevron: true }} onPress={() => setVenuesOpen(true)} separator={false} testID="twiz-btn-venues" />
        <TextField
          label="Description (optional)"
          value={info.description ?? ''}
          onChangeText={(description) => set({ description: description.length === 0 ? null : description })}
          multiline
          testID="twiz-input-description"
        />
      </View>
      <VenuesSheet
        visible={venuesOpen}
        selected={info.venueIds}
        onClose={() => setVenuesOpen(false)}
        onToggle={(venueId) => {
          const current = useTournamentWizardStore.getState().draft.info.venueIds;
          set({ venueIds: current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId] });
        }}
      />
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  form: { padding: space.md, gap: space.md },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  sheetBody: { gap: space.md },
  addVenue: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
});
