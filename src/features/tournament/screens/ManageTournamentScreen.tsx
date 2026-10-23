import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TournamentId, TournamentStatus } from '@/domain/types';
import { useDiscardGuard } from '@/features/scoring/hooks/useDiscardGuard';
import { ImpactSheet, TypedNameConfirm, isBlank, type DeleteFootprint } from '@/features/shared';
import { Banner, Button, Dialog, Inset, ListRow, SHEET_GUTTER, SectionHeader, Separator, Sheet, Text, TextField, space, useFormChain } from '@/ui';
import { useBackupStore, useExportStore, useTournamentListStore, useTournamentStore } from '@/stores';
import { RulesEditor, type CompetitionRulesValue } from '../components/RulesEditor';
import { showError, showToast } from '../hooks/toast';
import { useChangeFlow } from '../hooks/useChangeFlow';
import { TOURNAMENT_STATUS_LABEL } from '../labels';
import { routes } from '../routes';
import type { TournamentIndex } from '../selectors/names';
import { editPolicy, statusActions, type StatusActionVM } from '../selectors/policy';
import { InfoEditSheet } from '../sheets/InfoEditSheet';
import { ReasonSheet } from '../sheets/ReasonSheet';
import { chainError } from '../wizard/validation';
import { TournamentContainer } from './TournamentContainer';

export interface ManageTournamentScreenProps {
  readonly tournamentId: TournamentId;
}

const TEMPLATE_FIELDS = ['name', 'description'] as const;

type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'info' }
  | { readonly kind: 'rules'; readonly value: CompetitionRulesValue }
  | { readonly kind: 'status'; readonly action: StatusActionVM }
  | { readonly kind: 'template' }
  | { readonly kind: 'delete'; readonly footprint: DeleteFootprint };

function ManageBody({ tournamentId, index }: { readonly tournamentId: TournamentId; readonly index: TournamentIndex }) {
  const router = useRouter();
  const flow = useChangeFlow();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [templateName, setTemplateName] = useState(`${index.snapshot.tournament.name} format`);
  const [templateDescription, setTemplateDescription] = useState('');
  const tournament = index.snapshot.tournament;
  const policy = editPolicy(index);
  const actions = statusActions(index);
  const rules = index.snapshot.rules;
  const close = () => setMode({ kind: 'idle' });
  const templateChain = useFormChain(TEMPLATE_FIELDS);
  const savedRules: CompetitionRulesValue = { pointsSystem: rules.pointsSystem, nrrMode: rules.nrr.mode, tieBreakers: rules.tieBreakers };
  const rulesGuard = useDiscardGuard(mode.kind === 'rules' && JSON.stringify(mode.value) !== JSON.stringify(savedRules), close, 'dialog-discard-rules');

  const run = async (task: () => Promise<boolean>, success: string, failure: string): Promise<boolean> => {
    setBusy(true);
    const ok = await task();
    setBusy(false);
    if (ok) {
      showToast('success', success);
    } else {
      showError(useTournamentStore.getState().error, failure);
    }
    return ok;
  };

  const changeStatus = async (to: TournamentStatus, reason: string | null) => {
    const ok = await run(() => useTournamentStore.getState().setStatus(to, reason), `Tournament ${TOURNAMENT_STATUS_LABEL[to].toLowerCase()}`, "Couldn't change the status.");
    if (ok) {
      close();
      void useTournamentListStore.getState().load();
    }
  };

  const exportPdf = async () => {
    const exporter = useExportStore.getState();
    const uri = await exporter.tournamentPdf(tournamentId);
    if (uri === null) {
      showError(useExportStore.getState().error, "Couldn't create the PDF.");
      return;
    }
    await useExportStore.getState().share(uri, 'application/pdf');
  };

  const backup = async () => {
    const uri = await useBackupStore.getState().exportBackup({ kind: 'tournament', tournamentId });
    if (uri === null) {
      showError(useBackupStore.getState().error, "Couldn't create the backup.");
      return;
    }
    await useExportStore.getState().share(uri, 'application/json');
  };

  const startDelete = async () => {
    const footprint = await useTournamentStore.getState().previewDelete();
    if (footprint === null) {
      showError(useTournamentStore.getState().error, "Couldn't check what would be deleted.");
      return;
    }
    setMode({ kind: 'delete', footprint });
  };

  return (
    <View>
      <SectionHeader title="Details" />
      <ListRow
        title="Name, season, dates"
        subtitle={[tournament.name, tournament.season].filter(Boolean).join(' · ')}
        trailing={policy.info === 'forbidden' ? undefined : { kind: 'chevron' }}
        disabled={policy.info === 'forbidden'}
        onPress={() => setMode({ kind: 'info' })}
        testID="tmanage-btn-info"
      />
      <ListRow
        title="Rules"
        subtitle="Points, NRR, tie-breakers"
        trailing={policy.rules === 'forbidden' ? undefined : { kind: 'chevron' }}
        disabled={policy.rules === 'forbidden'}
        onPress={() => setMode({ kind: 'rules', value: savedRules })}
        testID="tmanage-btn-rules"
      />
      <Separator />
      <SectionHeader title={`Status · ${TOURNAMENT_STATUS_LABEL[tournament.status]}`} />
      {actions.length === 0 ? (
        <Inset>
          <Text variant="callout" tone="secondary">
            Finish the setup to start the tournament.
          </Text>
        </Inset>
      ) : (
        actions.map((action) => (
          <ListRow
            key={action.to}
            title={action.label}
            subtitle={action.blockedReason ?? action.description}
            trailing={action.enabled ? { kind: 'chevron' } : undefined}
            disabled={!action.enabled}
            onPress={() => setMode({ kind: 'status', action })}
            testID={action.testID}
          />
        ))
      )}
      <Separator />
      <SectionHeader title="Export" />
      <ListRow title="Export PDF" leading={{ icon: 'file-text' }} trailing={{ kind: 'chevron' }} onPress={() => void exportPdf()} testID="tmanage-btn-export-pdf" />
      <ListRow title="Back up tournament" leading={{ icon: 'hard-drive-download' }} trailing={{ kind: 'chevron' }} onPress={() => void backup()} testID="tmanage-btn-backup" />
      <ListRow title="Save as template" leading={{ icon: 'trophy' }} trailing={{ kind: 'chevron' }} onPress={() => setMode({ kind: 'template' })} testID="tmanage-btn-save-template" />
      <Separator />
      {policy.deleteTournament === 'forbidden' ? (
        <View style={styles.danger}>
          <Banner tone="info" message="Unarchive to delete" testID="tmanage-text-delete-locked" />
        </View>
      ) : (
        <Inset top="md" bottom="md">
          <Button label="Delete tournament" variant="destructive" icon="trash-2" onPress={() => void startDelete()} fullWidth testID="tmanage-btn-delete" />
        </Inset>
      )}
      {mode.kind === 'info' ? (
        <InfoEditSheet
          tournament={tournament}
          busy={busy}
          onClose={close}
          onSubmit={(patch) =>
            void run(() => useTournamentStore.getState().updateInfo(patch), 'Details saved', "Couldn't save the details.").then((ok) => {
              if (ok) {
                close();
              }
            })
          }
        />
      ) : null}
      {mode.kind === 'rules' ? (
        <Sheet
          visible={!rulesGuard.asking}
          title="Rules"
          onClose={rulesGuard.requestClose}
          testID="sheet-rules"
          footer={
            <Button
              label="Review changes"
              disabled={chainError(mode.value.tieBreakers) !== null}
              onPress={() => {
                const value = mode.value;
                close();
                void flow.start(
                  { kind: 'rules_change', stageId: null, pointsSystem: value.pointsSystem, tieBreakers: value.tieBreakers, nrr: { ...rules.nrr, mode: value.nrrMode } },
                  { successMessage: 'Rules changed' },
                );
              }}
              fullWidth
              testID="tmanage-btn-rules-review"
            />
          }
        >
          <View style={styles.sheetBleed}>
            <RulesEditor value={mode.value} onChange={(value) => setMode({ kind: 'rules', value })} testIDPrefix="tmanage" />
          </View>
        </Sheet>
      ) : null}
      {mode.kind === 'status' && mode.action.needsReason ? (
        <ReasonSheet
          visible
          title={mode.action.label}
          message={mode.action.description}
          confirmLabel={mode.action.label}
          required
          busy={busy}
          onClose={close}
          onSubmit={(reason) => void changeStatus(mode.action.to, reason)}
        />
      ) : null}
      <Dialog
        visible={mode.kind === 'status' && !mode.action.needsReason}
        title={mode.kind === 'status' ? `${mode.action.label}?` : ''}
        message={mode.kind === 'status' ? mode.action.description : undefined}
        cancel={{ label: 'Cancel', onPress: close }}
        confirm={{
          label: mode.kind === 'status' ? mode.action.label : 'Confirm',
          loading: busy,
          onPress: () => {
            if (mode.kind === 'status') {
              void changeStatus(mode.action.to, null);
            }
          },
        }}
        onRequestClose={close}
        testID="dialog-status"
      />
      {mode.kind === 'template' ? (
        <Sheet
          visible
          title="Save as template"
          onClose={close}
          testID="sheet-template"
          footer={
            <Button
              label="Save template"
              disabled={isBlank(templateName)}
              loading={busy}
              onPress={() =>
                void run(
                  async () => (await useTournamentStore.getState().saveAsTemplate({ name: templateName.trim(), description: templateDescription.trim() })) !== null,
                  'Template saved',
                  "Couldn't save the template.",
                ).then((ok) => {
                  if (ok) {
                    close();
                  }
                })
              }
              fullWidth
              testID="tmanage-btn-template-save"
            />
          }
        >
          <View style={styles.sheetBody}>
            <TextField label="Template name" value={templateName} onChangeText={setTemplateName} {...templateChain.field('name')} testID="tmanage-input-template-name" />
            <TextField
              label="Description (optional)"
              value={templateDescription}
              onChangeText={setTemplateDescription}
              multiline
              ref={templateChain.field('description').ref}
              testID="tmanage-input-template-description"
            />
            <Text variant="footnote" tone="secondary">
              Teams and results aren't included.
            </Text>
          </View>
        </Sheet>
      ) : null}
      {mode.kind === 'delete' ? (
        <TypedNameConfirm
          visible
          expected={tournament.name}
          footprint={mode.footprint}
          busy={busy}
          onCancel={close}
          onBackup={() => void backup()}
          onConfirm={(confirmation) =>
            void run(() => useTournamentStore.getState().delete(confirmation), 'Tournament deleted', "Couldn't delete the tournament.").then((ok) => {
              if (ok) {
                close();
                void useTournamentListStore.getState().load();
                router.dismissTo(routes.tournaments());
              }
            })
          }
        />
      ) : null}
      {rulesGuard.dialog}
      <ImpactSheet {...flow.sheet} names={index.impactNames} />
    </View>
  );
}

export function ManageTournamentScreen({ tournamentId }: ManageTournamentScreenProps) {
  return (
    <TournamentContainer tournamentId={tournamentId} testID="screen-tournament-manage" title="Tournament settings" width="column">
      {(index) => <ManageBody tournamentId={tournamentId} index={index} />}
    </TournamentContainer>
  );
}

const styles = StyleSheet.create({
  danger: { paddingVertical: space.md },
  sheetBody: { gap: space.md },
  sheetBleed: { marginHorizontal: -SHEET_GUTTER },
});
