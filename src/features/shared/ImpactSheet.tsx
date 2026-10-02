import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ImpactSummary } from '@/domain/types';
import { Button, Sheet, Text, space } from '@/ui';
import { ImpactSections } from './ImpactSections';
import { impactViewModel, type ImpactNames } from './impactViewModel';
import { Notice } from './Notice';
import { ReasonField } from './ReasonField';
import { isBlank, reasonReady } from './text';

export const IMPACT_SHEET_TITLE = 'What will change';

export interface ImpactSheetProps {
  readonly impact: ImpactSummary | null;
  readonly visible?: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onContinue: (reason: string | null) => void;
  readonly names?: ImpactNames;
  readonly notice?: string | null;
  readonly initialReason?: string;
  readonly reasonRequired?: boolean;
  readonly testID?: string;
}

interface ImpactBodyProps {
  readonly impact: ImpactSummary;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onContinue: (reason: string | null) => void;
  readonly names?: ImpactNames;
  readonly notice: string | null;
  readonly initialReason: string;
  readonly reasonRequired: boolean;
  readonly testID: string;
}

function ImpactBody({ impact, busy, onCancel, onContinue, names, notice, initialReason, reasonRequired, testID }: ImpactBodyProps) {
  const [reason, setReason] = useState(initialReason);
  const vm = impactViewModel(impact, names);
  const needsReason = vm.requiresReason || reasonRequired;
  const blocked = vm.blockedReason !== null;
  const missingReason = needsReason && !reasonReady(reason);
  const footer = blocked ? (
    <Button label="Close" variant="secondary" onPress={onCancel} fullWidth testID="impact-btn-close" />
  ) : (
    <View style={styles.actions}>
      <View style={styles.action}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth disabled={busy} testID="impact-btn-cancel" />
      </View>
      <View style={styles.action}>
        <Button
          label={vm.destructive ? 'Apply changes' : 'Continue'}
          variant={vm.destructive ? 'destructiveConfirm' : 'primary'}
          onPress={() => onContinue(isBlank(reason) ? null : reason.trim())}
          fullWidth
          loading={busy}
          disabled={missingReason}
          accessibilityHint={missingReason ? 'Type a reason first' : undefined}
          testID="impact-btn-continue"
        />
      </View>
    </View>
  );
  return (
    <Sheet visible title={IMPACT_SHEET_TITLE} onClose={busy ? undefined : onCancel} footer={footer} testID={testID}>
      <View style={styles.body}>
        {notice ? <Notice tone="warning" message={notice} testID="impact-text-notice" /> : null}
        <ImpactSections vm={vm} />
        {blocked ? (
          <Text variant="body" tone="danger" testID="impact-text-blocked">
            {vm.blockedReason}
          </Text>
        ) : null}
        {!blocked && needsReason ? <ReasonField required value={reason} onChange={setReason} testID="impact-input-reason" /> : null}
      </View>
    </Sheet>
  );
}

export function ImpactSheet({
  impact,
  visible = true,
  busy,
  onCancel,
  onContinue,
  names,
  notice = null,
  initialReason = '',
  reasonRequired = false,
  testID = 'sheet-impact',
}: ImpactSheetProps) {
  if (!visible || impact === null) {
    return null;
  }
  return (
    <ImpactBody
      impact={impact}
      busy={busy}
      onCancel={onCancel}
      onContinue={onContinue}
      names={names}
      notice={notice}
      initialReason={initialReason}
      reasonRequired={reasonRequired}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  actions: { flexDirection: 'row', gap: space.xs },
  action: { flex: 1 },
});
