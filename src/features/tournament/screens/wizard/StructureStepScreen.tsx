import { useEffect, useState } from 'react';
import { builtinTemplates, templateFitsTeamCount } from '@/domain/tournament/templates';
import type { Stage, TournamentStructureKind, TournamentTemplate } from '@/domain/types';
import { Disclosure, EmptyState, Inset, ListRow, RadioList, SectionHeader, Separator } from '@/ui';
import { useTournamentWizardStore } from '@/stores';
import { newId, nowIso } from '../../ids';
import { STRUCTURE_KIND_KEY, STRUCTURE_KIND_LABEL } from '../../labels';
import { CHAMPION_MARK, stageNameMap, stageSubtitle } from '../../selectors/stages';
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
  league: 'Everyone plays everyone.',
  groups: 'Pool tables decide the title.',
  knockout: 'Single elimination.',
  groups_knockout: 'Top pool teams advance to knockouts.',
  custom: 'Your own stages and fixtures.',
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
      {fitting.length === 0 ? (
        <EmptyState title="No template fits" testID="twiz-text-no-template" />
      ) : (
        <RadioList
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
        <Inset top="xs">
          <Disclosure
            label={`Other team counts (${other.length})`}
            expandedLabel="Hide other team counts"
            expanded={showOther}
            onToggle={setShowOther}
            testID="twiz-btn-other-templates"
          >
            {null}
          </Disclosure>
        </Inset>
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
      <Separator />
      <SectionHeader title="Structure" />
      <RadioList
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
      <Separator />
      <SectionHeader
        title="Stages"
        action={{ label: 'Add stage', onPress: () => applyStructure(addKnockoutStage(currentStructure(), context())), testID: 'twiz-btn-add-stage' }}
      />
      {stages.map((stage, index) => (
        <ListRow
          key={stage.id}
          title={`${index + 1}  ${stage.name}`}
          subtitle={[stageSubtitle(stage, draft.pools, names), stage.config.decidesChampion && stages.length > 1 ? CHAMPION_MARK : null].filter(Boolean).join('\n')}
          trailing={{ kind: 'chevron' }}
          onPress={() => setEditing(stage)}
          testID={`twiz-row-stage-${index + 1}`}
        />
      ))}
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
