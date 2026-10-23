import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { AuditEvent, TournamentId } from '@/domain/types';
import { ImpactSections, impactViewModel } from '@/features/shared';
import { Button, Disclosure, EmptyState, ErrorState, Inset, Separator, Skeleton, Tabs, Text, space, useGutter, useScreenList } from '@/ui';
import { useTournamentStore } from '@/stores';
import type { TournamentIndex } from '../selectors/names';
import { AUDIT_FILTERS, auditRow, filterAudit, impactLabel, type AuditFilter, type AuditRowVM } from '../selectors/audit';
import { TournamentContainer } from './TournamentContainer';

export interface AuditScreenProps {
  readonly tournamentId: TournamentId;
}

const PAGE_SIZE = 30;

function AuditRow({ row, position, showDay, index }: { readonly row: AuditRowVM; readonly position: number; readonly showDay: boolean; readonly index: TournamentIndex }) {
  const gutter = useGutter();
  const impact = row.event.impact;
  return (
    <View>
      {showDay ? (
        <Inset top="lg" bottom="xs">
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {row.day}
          </Text>
        </Inset>
      ) : null}
      <View style={[styles.row, { paddingHorizontal: gutter }]} testID={`audit-row-${position}`}>
        <Text variant="tableNumeric" tone="secondary" style={styles.time}>
          {row.time}
        </Text>
        <View style={styles.main}>
          <Text variant="body" weight="semibold" testID={`audit-text-summary-${position}`}>
            {row.summary}
          </Text>
          {row.change ? (
            <Text variant="callout" tone="secondary">
              {row.change}
            </Text>
          ) : null}
          {row.reason ? (
            <Text variant="footnote" tone="secondary" testID={`audit-text-reason-${position}`}>
              {`“${row.reason}”`}
            </Text>
          ) : null}
          {impact ? (
            <Disclosure label={impactLabel(impact)} expandedLabel="Hide impact" accessibilityHint={impact.headline} testID={`audit-btn-impact-${position}`}>
              <View style={styles.impact}>
                <Text variant="callout">{impact.headline}</Text>
                <ImpactSections vm={impactViewModel(impact, index.impactNames)} />
              </View>
            </Disclosure>
          ) : null}
        </View>
      </View>
      <Separator inset={gutter} />
    </View>
  );
}

function AuditBody({ index, filter }: { readonly index: TournamentIndex; readonly filter: AuditFilter }) {
  const list = useScreenList();
  const [events, setEvents] = useState<readonly AuditEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = index.snapshot.version;

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void useTournamentStore
      .getState()
      .loadAudit({ limit: PAGE_SIZE })
      .then((page) => {
        if (!active) {
          return;
        }
        if (page === null) {
          setStatus('error');
          return;
        }
        setEvents(page);
        setExhausted(page.length < PAGE_SIZE);
        setStatus('ready');
      });
    return () => {
      active = false;
    };
  }, [version, attempt]);

  const loadMore = async () => {
    const last = events[events.length - 1];
    if (!last || exhausted || loadingMore) {
      return;
    }
    setLoadingMore(true);
    const page = await useTournamentStore.getState().loadAudit({ limit: PAGE_SIZE, before: last.createdAt });
    setLoadingMore(false);
    if (page === null) {
      return;
    }
    setEvents([...events, ...page.filter((event) => !events.some((existing) => existing.id === event.id))]);
    setExhausted(page.length < PAGE_SIZE);
  };

  if (status === 'loading' && events.length === 0) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <Skeleton rows={6} testID="audit-loading" />
      </View>
    );
  }
  if (status === 'error' && events.length === 0) {
    return (
      <View style={{ paddingTop: list.contentInset.paddingTop }}>
        <ErrorState title="Couldn't load the audit log" onRetry={() => setAttempt(attempt + 1)} testID="audit-error" />
      </View>
    );
  }
  const rows = filterAudit(events, filter).map(auditRow);
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item, index: position }) => (
        <AuditRow row={item} position={position + 1} showDay={position === 0 || rows[position - 1].day !== item.day} index={index} />
      )}
      ListEmptyComponent={
        <EmptyState icon="history" title="No changes yet" testID="audit-empty" />
      }
      ListFooterComponent={
        !exhausted && events.length > 0 ? (
          <View style={styles.more}>
            <Button label="Load older" variant="tertiary" loading={loadingMore} onPress={() => void loadMore()} testID="audit-btn-more" />
          </View>
        ) : null
      }
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      initialNumToRender={15}
      onScroll={list.onScroll}
      scrollEventThrottle={list.scrollEventThrottle}
      scrollIndicatorInsets={list.scrollIndicatorInsets}
      contentContainerStyle={list.contentInset}
      testID="audit-list"
    />
  );
}

export function AuditScreen({ tournamentId }: AuditScreenProps) {
  const [filter, setFilter] = useState<AuditFilter>('all');
  return (
    <TournamentContainer
      tournamentId={tournamentId}
      testID="screen-audit"
      title="Audit log"
      scroll={false}
      controls={() => (
        <Tabs
          tabs={AUDIT_FILTERS.map((entry) => ({ key: entry.value, label: entry.label, accessibilityLabel: entry.accessibilityLabel, testID: `audit-tab-${entry.value}` }))}
          selectedKey={filter}
          onSelect={setFilter}
          accessibilityLabel="Filter changes"
        />
      )}
    >
      {(index) => <AuditBody index={index} filter={filter} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  time: { minWidth: space['4xl'] },
  main: { flex: 1, minWidth: 0, gap: space.xxs },
  more: { paddingVertical: space.md, alignItems: 'center' },
  impact: { gap: space.xs, paddingTop: space.xs },
});
