import { StyleSheet, View } from 'react-native';
import type { TournamentId } from '@/domain/types';
import { Banner, EmptyState, ListRow, Sheet, Text, space } from '@/ui';
import type { TournamentTargetVM } from '../selectors/exportTargets';

export type TournamentListState = 'loading' | 'ready' | 'failed';

export interface TournamentExportSheetProps {
  readonly visible: boolean;
  readonly state: TournamentListState;
  readonly tournaments: readonly TournamentTargetVM[];
  readonly onSelect: (tournamentId: TournamentId) => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

function Placeholder({ state, onRetry }: { readonly state: TournamentListState; readonly onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <View style={styles.loading}>
        <Text variant="body" tone="secondary" testID="backup-text-tournaments-loading">
          Loading tournaments…
        </Text>
      </View>
    );
  }
  if (state === 'failed') {
    return (
      <Banner
        tone="danger"
        message="Couldn't load your tournaments. Your data is safe."
        action={{ label: 'Try again', onPress: onRetry, testID: 'backup-btn-tournaments-retry' }}
        testID="backup-banner-tournaments-error"
      />
    );
  }
  return <EmptyState title="No tournaments yet" body="Tournaments you create appear here." testID="backup-text-no-tournaments" />;
}

export function TournamentExportSheet({ visible, state, tournaments, onSelect, onRetry, onClose }: TournamentExportSheetProps) {
  return (
    <Sheet
      visible={visible}
      title="Export a tournament"
      subtitle="Saves the tournament with its teams, fixtures and matches."
      onClose={onClose}
      testID="sheet-backup-tournament"
    >
      {tournaments.length === 0 ? (
        <Placeholder state={state} onRetry={onRetry} />
      ) : (
        tournaments.map((target) => (
          <ListRow
            key={target.id}
            title={target.title}
            subtitle={target.detail}
            trailing={{ kind: 'chevron' }}
            onPress={() => onSelect(target.id)}
            testID={target.testID}
          />
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  loading: { padding: space.md },
});
