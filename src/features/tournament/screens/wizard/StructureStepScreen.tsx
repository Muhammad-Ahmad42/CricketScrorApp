import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { builtinTemplates, templateFitsTeamCount } from '@/domain/tournament/templates';
import type { Stage, TournamentStructureKind, TournamentTemplate } from '@/domain/types';
import { ChoiceList } from '@/features/shared';
import { Button, ListRow, SectionHeader, Separator, Text, space } from '@/ui';
import { useTournamentWizardStore } from '@/stores';
import { newId, nowIso } from '../../ids';
import { STRUCTURE_KIND_KEY, STRUCTURE_KIND_LABEL } from '../../labels';
import { CHAMPION_MARK, stageNameMap, stageSummary } from '../../selectors/stages';
import { StageEditorSheet } from '../../sheets/StageEditorSheet';
import {
  addKnockoutStage,
  defaultRules,
  moveStage,
  removeStage,
  stagePools,
  structureFromKind,
  structureFromTemplate,
  withPoolCount,
  withStage,
  type DraftStructure,
} from '../../wizard/structure';
import { structureError } from '../../wizard/validation';
import { WizardFrame } from './WizardFrame';

const KINDS: readonly TournamentStructureKind[] = ['league', 'groups', 'knockout', 'groups_knockout', 'custom'];

const KIND_DESCRIPTION: { readonly [K in TournamentStructureKind]: string } = {
  league: 'Everyone plays everyone in one table.',
  groups: 'Pools play round robins; the pool tables decide the title.',
  knockout: 'Single elimination from the first round.',
  groups_knockout: 'Pools first, then the best teams play knockouts.',
  custom: 'Build your own stages and add fixtures by hand.',
};

export function templateSlug(template: TournamentTemplate): string {
  return template.id.replace(/^builtin:/, '');
}

function context() {
  const draft = useTournamentWizardStore.getState().draft;
  return { tournamentId: draft.tournamentId ?? '', now: nowIso(), ids: newId, teamCount: draft.teams.length };
}

function currentStructure(): DraftStructure {
  const draft = useTournamentWizardStore.getState().draft;
  return { stages: draft.stages, pools: draft.pools, slots: draft.slots };
}

function applyStructure(structure: DraftStructure): void {
  useTournamentWizardStore.getState().update({ ...structure, poolAssignment: null, fixturePlan: null });
}

function applyKind(kind: TournamentStructureKind): void {
  const draft = useTournamentWizardStore.getState().draft;
  const ctx = context();
  const rules = draft.rules ?? defaultRules(ctx.tournamentId, ctx.now);
  const structure = structureFromKind(kind, rules, ctx);
  useTournamentWizardStore.getState().update({
    info: { ...draft.info, structureKind: kind, templateId: null },
    rules,
    stages: structure.stages,
    pools: structure.pools,
    slots: structure.slots,
    poolAssignment: null,
    fixturePlan: null,
  });
}

function applyTemplate(template: TournamentTemplate): void {
  const draft = useTournamentWizardStore.getState().draft;
  const structure = structureFromTemplate(template, context());
  useTournamentWizardStore.getState().update({
    info: { ...draft.info, structureKind: template.structureKind, templateId: template.id },
    rules: structure.rules,
    stages: structure.stages,
    pools: structure.pools,
    slots: structure.slots,
    poolAssignment: null,
    fixturePlan: null,
  });
}

export function StructureStepScreen() {
  const draft = useTournamentWizardStore((state) => state.draft);
  const [templates, setTemplates] = useState<readonly TournamentTemplate[]>(builtinTemplates());
  const [editing, setEditing] = useState<Stage | null>(null);
  const [showOther, setShowOther] = useState(false);
  const teamCount = draft.teams.length;

  useEffect(() => {
    let active = true;
    void useTournamentWizardStore
      .getState()
      .listTemplates()
      .then((loaded) => {
        if (active && loaded && loaded.length > 0) {
          setTemplates(loaded);
        }
      });
    if (useTournamentWizardStore.getState().draft.stages.length === 0) {
      applyKind(useTournamentWizardStore.getState().draft.info.structureKind);
    }
    return () => {
      active = false;
    };
  }, []);

  const fitting = templates.filter((template) => templateFitsTeamCount(template, teamCount).ok);
  const other = templates.filter((template) => !templateFitsTeamCount(template, teamCount).ok);
  const stages = [...draft.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const names = stageNameMap(stages);
  const error = structureError(stages);
  const selectedTemplate = draft.info.templateId;

  return (
    <WizardFrame step="structure" nextDisabled={error !== null} nextHint={error}>
      <SectionHeader title={`Templates for ${teamCount} teams`} />
      <View style={styles.padded}>
        {fitting.length === 0 ? (
          <Text variant="callout" tone="secondary">
            No template fits this number of teams. Choose a structure below.
          </Text>
        ) : (
          <ChoiceList
            choices={fitting.map((template) => ({
              value: template.id,
              label: template.name,
              description: template.description,
              testID: `twiz-chip-template-${templateSlug(template)}`,
            }))}
            value={selectedTemplate}
            onChange={(templateId) => {
              const template = templates.find((candidate) => candidate.id === templateId);
              if (template) {
                applyTemplate(template);
              }
            }}
            accessibilityLabel="Template"
          />
        )}
        {other.length > 0 ? (
          <Button
            label={showOther ? 'Hide other templates' : `Other templates (${other.length})`}
            variant="tertiary"
            size="sm"
            onPress={() => setShowOther(!showOther)}
            testID="twiz-btn-other-templates"
          />
        ) : null}
        {showOther
          ? other.map((template) => (
              <ListRow
                key={template.id}
                title={template.name}
                subtitle={templateFitsTeamCount(template, teamCount).message ?? undefined}
                disabled
                compact
                testID={`twiz-chip-template-${templateSlug(template)}`}
              />
            ))
          : null}
      </View>
      <Separator />
      <SectionHeader title="Structure" />
      <View style={styles.padded}>
        <ChoiceList
          choices={KINDS.map((kind) => ({
            value: kind,
            label: STRUCTURE_KIND_LABEL[kind],
            description: KIND_DESCRIPTION[kind],
            testID: `twiz-chip-structure-${STRUCTURE_KIND_KEY[kind]}`,
          }))}
          value={selectedTemplate === null ? draft.info.structureKind : null}
          onChange={applyKind}
          accessibilityLabel="Structure"
        />
      </View>
      <Separator />
      <SectionHeader
        title="Stages"
        action={{ label: 'Stage', onPress: () => applyStructure(addKnockoutStage(currentStructure(), context())), testID: 'twiz-btn-add-stage' }}
      />
      {stages.map((stage, index) => (
        <ListRow
          key={stage.id}
          title={`${index + 1}  ${stage.name}`}
          subtitle={[stageSummary(stage, draft.pools, names), stage.config.decidesChampion ? CHAMPION_MARK : null].filter(Boolean).join('\n')}
          trailing={{ kind: 'chevron' }}
          onPress={() => setEditing(stage)}
          testID={`twiz-row-stage-${index + 1}`}
        />
      ))}
      {error ? (
        <Text variant="footnote" tone="danger" style={styles.padded} testID="twiz-text-structure-error">
          {error}
        </Text>
      ) : null}
      {editing ? (
        <StageEditorSheet
          visible
          stage={editing}
          poolCount={stagePools(draft.pools, editing.id).length}
          canMoveUp={editing.orderIndex > 0}
          canMoveDown={editing.orderIndex < stages.length - 1}
          canDelete={stages.length > 1}
          onClose={() => setEditing(null)}
          onMove={(direction) => {
            applyStructure(moveStage(currentStructure(), editing.id, direction, teamCount, newId));
            setEditing(null);
          }}
          onDelete={() => {
            applyStructure(removeStage(currentStructure(), editing.id, teamCount, newId));
            setEditing(null);
          }}
          onSave={({ stage, poolCount }) => {
            const withStageSaved = withStage(currentStructure(), stage, teamCount, newId);
            const next = poolCount === null ? withStageSaved : withPoolCount(withStageSaved, stage.id, poolCount, teamCount, newId);
            applyStructure(next);
            useTournamentWizardStore.getState().update({ info: { ...useTournamentWizardStore.getState().draft.info, templateId: null } });
            setEditing(null);
          }}
        />
      ) : null}
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: space.md, gap: space.xs },
});
