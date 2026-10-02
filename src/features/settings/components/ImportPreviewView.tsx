import { StyleSheet, View } from 'react-native';
import type { ImportConflictPolicy } from '@/domain/types';
import { Banner, Button, Icon, SectionHeader, Text, space, useTheme } from '@/ui';
import type { ImportPreviewVM } from '../selectors/importPreview';
import { ChoiceRow } from './ChoiceRow';
import { ConflictList } from './ConflictList';
import { InfoRow } from './InfoRow';
import { IssueList } from './IssueList';

export interface ImportPreviewViewProps {
  readonly vm: ImportPreviewVM;
  readonly policy: ImportConflictPolicy;
  readonly busy: boolean;
  readonly onPolicyChange: (policy: ImportConflictPolicy) => void;
}

function Summary({ vm }: { readonly vm: ImportPreviewVM }) {
  const theme = useTheme();
  return (
    <View style={[styles.summary, { backgroundColor: theme.color.surface }]}>
      <Text variant="headline" numberOfLines={2} testID="import-text-file">
        {vm.title}
      </Text>
      <Text variant="footnote" tone="secondary" testID="import-text-scope">
        {vm.source ? `${vm.scopeLabel} · ${vm.source}` : vm.scopeLabel}
      </Text>
      {vm.versions ? (
        <Text variant="footnote" tone="secondary" testID="import-text-versions">
          {vm.versions}
        </Text>
      ) : null}
      <View style={styles.validity} accessible accessibilityLabel={vm.validity}>
        <Icon name={vm.importable ? 'circle-check' : 'circle-alert'} size={20} color={vm.importable ? 'success' : 'danger'} />
        <Text variant="body" weight="medium" style={styles.validityText} testID="import-text-summary">
          {vm.validity}
        </Text>
      </View>
    </View>
  );
}

function SettingsNote({ text }: { readonly text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: theme.color.surface }]} accessible accessibilityLabel={text}>
      <Icon name="info" size={20} color="textSecondary" />
      <Text variant="footnote" tone="secondary" style={styles.noteText} testID="import-text-settings-kept">
        {text}
      </Text>
    </View>
  );
}

export function ImportPreviewView({ vm, policy, busy, onPolicyChange }: ImportPreviewViewProps) {
  return (
    <View testID="import-group-preview">
      <Summary vm={vm} />
      {vm.previouslyImported ? <Banner tone="warning" message={vm.previouslyImported} testID="import-text-previously-imported" /> : null}
      {vm.issues.length > 0 ? (
        <>
          <SectionHeader title={vm.importable ? 'Warnings' : 'Why this file cannot be imported'} />
          <IssueList issues={vm.issues} />
        </>
      ) : null}
      {vm.contents.length > 0 ? (
        <>
          <SectionHeader title="In this file" />
          {vm.contents.map((line, index) => (
            <InfoRow key={line.key} label={line.label} value={line.value} valueTestID={`import-text-count-${line.key}`} separator={index < vm.contents.length - 1} />
          ))}
          {vm.settingsNote ? <SettingsNote text={vm.settingsNote} /> : null}
        </>
      ) : null}
      {vm.conflicts.length > 0 ? (
        <>
          <SectionHeader title="Already on this phone" />
          <ConflictList conflicts={vm.conflicts} />
        </>
      ) : null}
      {vm.policies.length > 0 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="If items already exist">
          <SectionHeader title="If items already exist" />
          {vm.policies.map((option) => (
            <ChoiceRow
              key={option.policy}
              title={option.title}
              detail={option.detail}
              destructive={option.destructive && (vm.localLoss.matches > 0 || vm.localLoss.events > 0)}
              selected={policy === option.policy}
              onSelect={() => onPolicyChange(option.policy)}
              disabled={busy}
              testID={`import-chip-policy-${option.chip}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export interface ImportPreviewActionProps {
  readonly vm: ImportPreviewVM;
  readonly busy: boolean;
  readonly onImport: () => void;
}

export function ImportPreviewAction({ vm, busy, onImport }: ImportPreviewActionProps) {
  return (
    <Button
      label="Import"
      onPress={onImport}
      loading={busy}
      disabled={busy}
      fullWidth
      accessibilityHint={vm.policies.length > 0 ? 'Imports the file using the option chosen above' : 'Adds the data in this file to this phone'}
      testID="import-btn-apply"
    />
  );
}

const styles = StyleSheet.create({
  summary: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs },
  validity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: space.xs },
  validityText: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
  noteText: { flex: 1 },
});
