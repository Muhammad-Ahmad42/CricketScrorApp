import { Share, StyleSheet, View } from 'react-native';
import { space } from '../theme';
import { Text } from '../typography';
import { Button } from './Button';
import type { StateAction } from './EmptyState';
import { Icon } from './Icon';

export interface ErrorStateProps {
  readonly title: string;
  readonly body?: string;
  readonly onRetry: () => void;
  readonly retryLabel?: string;
  readonly secondaryAction?: StateAction;
  readonly details?: string | null;
  readonly testID?: string;
}

export const DEFAULT_ERROR_BODY = 'Your data is safe on this device. Try again, or open Diagnostics for details.';
const SHARE_DETAILS_LABEL = 'Share technical details';
const SHARE_DETAILS_TITLE = 'Scorebook technical details';

function shareTechnicalDetails(details: string): void {
  try {
    void Share.share({ title: SHARE_DETAILS_TITLE, message: details }, { dialogTitle: SHARE_DETAILS_TITLE }).catch(() => undefined);
  } catch {
    return;
  }
}

export function ErrorState({
  title,
  body = DEFAULT_ERROR_BODY,
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  details,
  testID = 'error-screen',
}: ErrorStateProps) {
  return (
    <View testID={testID} style={styles.root}>
      <Icon name="circle-alert" size={32} color="danger" />
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" tone="secondary" testID="error-text-message">
        {body}
      </Text>
      <View style={styles.actions}>
        <Button label={retryLabel} onPress={onRetry} fullWidth testID="error-btn-retry" />
        {secondaryAction ? (
          <Button label={secondaryAction.label} onPress={secondaryAction.onPress} variant="tertiary" testID={secondaryAction.testID} />
        ) : null}
      </View>
      {details ? (
        <View style={styles.details}>
          <Button
            label={SHARE_DETAILS_LABEL}
            icon="share"
            variant="tertiary"
            size="sm"
            accessibilityHint="Sends the technical details to another app for support. They are not shown here."
            onPress={() => shareTechnicalDetails(details)}
            testID="error-btn-details"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space['3xl'], paddingHorizontal: space.md, gap: space.sm },
  actions: { gap: space.xs, marginTop: space.md },
  details: { marginTop: space.md, alignItems: 'flex-start' },
});
