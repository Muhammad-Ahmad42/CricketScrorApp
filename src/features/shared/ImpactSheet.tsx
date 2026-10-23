import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ImpactSummary } from '@/domain/types';
import { Button, Disclosure, InlineNotice, Sheet, Text, space } from '@/ui';
import { ImpactSections, hasImpactSections, impactDetailsLabel } from './ImpactSections';
import { impactViewModel, type ImpactNames } from './impactViewModel';
import { ReasonField } from './ReasonField';
import { isBlank, reasonReady } from './text';

export const IMPACT_SHEET_TITLE = 'What will change';
export const REASON_HINT = 'Add a reason to continue.';

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
  const submit = () => onContinue(isBlank(reason) ? null : reason.trim());
  const footer = blocked ? (
    <Button label="Close" variant="secondary" onPress={onCancel} fullWidth testID="impact-btn-close" />
  ) : (
    <View style={styles.footer}>
      {vm.shortfalls.map((line, index) => (
        <InlineNotice key={line.key} tone="warning" headline={line.text} detail={line.detail ?? null} testID={`impact-text-shortfall-${index + 1}`} />
      ))}
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth disabled={busy} testID="impact-btn-cancel" />
        </View>
        <View style={styles.action}>
          <Button
            label={vm.destructive ? 'Apply changes' : 'Continue'}
            variant={vm.destructive ? 'destructiveConfirm' : 'primary'}
            onPress={submit}
            fullWidth
            loading={busy}
            disabled={missingReason}
            accessibilityHint={missingReason ? REASON_HINT : undefined}
            testID="impact-btn-continue"
          />
        </View>
      </View>
    </View>
  );
  return (
    <Sheet visible title={IMPACT_SHEET_TITLE} onClose={busy ? undefined : onCancel} footer={footer} testID={testID}>
      <View style={styles.body}>
        {notice ? <InlineNotice tone="warning" headline={notice} testID="impact-text-notice" /> : null}
        <View style={styles.summary}>
          <Text variant="headline" testID="impact-text-headline">
            {vm.headline}
          </Text>
          {vm.keyItems.map((item, index) => (
            <View key={item.key} style={styles.item}>
              <Text variant="callout" testID={`impact-text-line-${index + 1}`}>
                {item.headline}
              </Text>
              {item.detail ? (
                <Text variant="footnote" tone="secondary" testID={`impact-text-line-${index + 1}-detail`}>
                  {item.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        {vm.severityNotice ? (
          <InlineNotice tone={vm.destructive ? 'danger' : 'warning'} headline={vm.severityNotice} testID="impact-text-severity" />
        ) : null}
        {hasImpactSections(vm) ? (
          <Disclosure label={impactDetailsLabel(vm)} accessibilityHint="Shows each fixture, standing and slot that changes" testID="impact-btn-details">
            <ImpactSections vm={vm} showShortfalls={false} />
          </Disclosure>
        ) : null}
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
  summary: { gap: space.xs },
  item: { gap: space.xxs },
  footer: { gap: space.xs },
  actions: { flexDirection: 'row', gap: space.xs },
  action: { flex: 1 },
});
