import { StyleSheet, View } from 'react-native';
import type { TournamentId } from '@/domain/types';
import { Banner, EmptyState, ListRow, Sheet, space } from '@/ui';
import { BusyLine } from '../components/BusyLine';
import { COPY } from '../copy';
import type { TournamentTargetVM } from '../selectors/exportTargets';
import { problemText } from '../selectors/problem';

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
    return <BusyLine text={COPY.tournamentsLoading} testID="backup-text-tournaments-loading" />;
  }
  if (state === 'failed') {
    const problem = problemText(COPY.tournamentsFailed);
    return (
      <Banner
        tone="danger"
        message={problem.headline}
        supporting={problem.supporting}
        action={{ label: COPY.tryAgain, onPress: onRetry, testID: 'backup-btn-tournaments-retry' }}
        testID="backup-banner-tournaments-error"
      />
    );
  }
  return (
    <View style={styles.empty}>
      <EmptyState title={COPY.noTournaments} icon="trophy" testID="backup-text-no-tournaments" />
    </View>
  );
}

export function TournamentExportSheet({ visible, state, tournaments, onSelect, onRetry, onClose }: TournamentExportSheetProps) {
  return (
    <Sheet visible={visible} title="Export a tournament" onClose={onClose} testID="sheet-backup-tournament">
      {tournaments.length === 0 ? (
        <Placeholder state={state} onRetry={onRetry} />
      ) : (
        tournaments.map((target, index) => (
          <ListRow
            key={target.id}
            title={target.title}
            subtitle={target.detail}
            trailing={{ kind: 'chevron' }}
            onPress={() => onSelect(target.id)}
            separator={index < tournaments.length - 1}
            testID={target.testID}
          />
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  empty: { paddingBottom: space.xl },
});
