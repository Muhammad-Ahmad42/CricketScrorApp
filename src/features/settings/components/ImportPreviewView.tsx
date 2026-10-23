import { StyleSheet, View } from 'react-native';
import type { ImportConflictPolicy } from '@/domain/types';
import { Banner, Button, Icon, RadioList, SectionHeader, Text, space } from '@/ui';
import type { ImportPreviewVM } from '../selectors/importPreview';
import { Block } from './Block';
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
  return (
    <Block gap="xxs">
      <Text variant="headline" testID="import-text-file">
        {vm.title}
      </Text>
      <Text variant="footnote" tone="secondary" testID="import-text-scope">
        {vm.scopeLabel}
      </Text>
      {vm.source ? (
        <Text variant="footnote" tone="secondary" testID="import-text-source">
          {vm.source}
        </Text>
      ) : null}
      <View style={styles.validity} accessible accessibilityLabel={vm.validity}>
        <Icon name={vm.importable ? 'circle-check' : 'circle-alert'} size={20} color={vm.importable ? 'success' : 'danger'} />
        <Text variant="body" weight="medium" style={styles.validityText} testID="import-text-summary">
          {vm.validity}
        </Text>
      </View>
    </Block>
  );
}

export function ImportPreviewView({ vm, policy, busy, onPolicyChange }: ImportPreviewViewProps) {
  const errors = vm.issues.filter((issue) => issue.severity === 'error');
  const warnings = vm.issues.filter((issue) => issue.severity !== 'error');
  const destructive = vm.localLoss.matches > 0 || vm.localLoss.events > 0;
  return (
    <View testID="import-group-preview">
      <Summary vm={vm} />
      {vm.previouslyImported ? <Banner tone="warning" message={vm.previouslyImported} testID="import-text-previously-imported" /> : null}
      {errors.length > 0 ? (
        <>
          <SectionHeader title="Problems" />
          <IssueList issues={errors} />
        </>
      ) : null}
      {warnings.length > 0 ? (
        <>
          <SectionHeader title="Warnings" />
          <IssueList issues={warnings} offset={errors.length} />
        </>
      ) : null}
      {vm.contents.length > 0 ? (
        <>
          <SectionHeader title="In this file" />
          {vm.contents.map((line, index) => (
            <InfoRow
              key={line.key}
              label={line.label}
              value={line.value}
              valueTestID={line.testID}
              separator={index < vm.contents.length - 1}
            />
          ))}
        </>
      ) : null}
      {vm.conflicts.length > 0 ? (
        <>
          <SectionHeader title="Already on this phone" />
          <ConflictList conflicts={vm.conflicts} />
        </>
      ) : null}
      {vm.policies.length > 0 ? (
        <>
          <SectionHeader title="If items already exist" />
          <RadioList
            accessibilityLabel="If items already exist"
            value={policy}
            onChange={onPolicyChange}
            choices={vm.policies.map((option) => ({
              value: option.policy,
              label: option.title,
              description: option.detail,
              tone: option.destructive && destructive ? 'danger' : 'default',
              disabled: busy,
              testID: `import-chip-policy-${option.chip}`,
            }))}
          />
        </>
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
  validity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: space.xs },
  validityText: { flex: 1, minWidth: 0 },
});
