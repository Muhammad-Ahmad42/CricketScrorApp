import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { space, useTheme, type ColorToken } from '../theme';
import { Text, type TextTone, type TextVariant } from '../typography';
import { Button } from './Button';
import type { StateAction } from './EmptyState';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, hitSlopFor, useFocusRing } from './internal/interaction';
import { Sheet } from './Sheet';

export const HEADLINE_MAX = 40;
export const SUPPORTING_MAX = 80;
export const WHY_LABEL = 'Why?';
export const DETAILS_LABEL = 'Details';

export interface ScannableCheck {
  readonly headline: boolean;
  readonly supporting: boolean;
}

export function isScannable(headline: string, supporting?: string | null): ScannableCheck {
  return {
    headline: headline.trim().length <= HEADLINE_MAX,
    supporting: supporting === undefined || supporting === null || supporting.trim().length <= SUPPORTING_MAX,
  };
}

export type DetailContent = string | readonly string[];

function paragraphs(detail: DetailContent): readonly string[] {
  return (typeof detail === 'string' ? [detail] : detail).filter((part) => part.trim().length > 0);
}

export interface DisclosureProps {
  readonly children: ReactNode;
  readonly label?: string;
  readonly expandedLabel?: string;
  readonly expanded?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onToggle?: (expanded: boolean) => void;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

const TOGGLE_HEIGHT = 32;

export function Disclosure({
  children,
  label = DETAILS_LABEL,
  expandedLabel,
  expanded,
  defaultExpanded = false,
  onToggle,
  accessibilityHint,
  testID,
}: DisclosureProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const [own, setOwn] = useState(defaultExpanded);
  const open = expanded ?? own;
  const toggle = () => {
    const next = !open;
    if (expanded === undefined) {
      setOwn(next);
    }
    onToggle?.(next);
  };
  const shown = open ? (expandedLabel ?? label) : label;
  return (
    <View style={styles.disclosure}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={shown}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={toggle}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        hitSlop={hitSlopFor(TOGGLE_HEIGHT)}
        style={({ pressed }) => [
          styles.toggle,
          { borderRadius: theme.radius.md, backgroundColor: pressed ? theme.color.surfaceSunken : 'transparent' },
          focusRingStyle(theme, focus.focused),
        ]}
      >
        <Text variant="subhead" weight="semibold" tone="accent">
          {shown}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="accent" />
      </Pressable>
      {open ? (
        <View testID={testID ? `${testID}-body` : undefined} style={styles.body}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export type ExplainedTone = 'default' | 'secondary' | 'success' | 'warning' | 'danger';
export type DetailPresentation = 'inline' | 'sheet';

const HEADLINE_TONE: { readonly [K in ExplainedTone]: TextTone } = {
  default: 'primary',
  secondary: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export interface ExplainedTextProps {
  readonly headline: string;
  readonly supporting?: string | null;
  readonly detail?: DetailContent | null;
  readonly detailTitle?: string;
  readonly whyLabel?: string;
  readonly presentation?: DetailPresentation;
  readonly tone?: ExplainedTone;
  readonly size?: 'body' | 'subhead';
  readonly headlineVariant?: TextVariant;
  readonly testID?: string;
}

function DetailBody({ detail, testID }: { readonly detail: DetailContent; readonly testID?: string }) {
  return (
    <View style={styles.detail} testID={testID}>
      {paragraphs(detail).map((paragraph, index) => (
        <Text key={index} variant="callout" tone="secondary">
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

export function ExplainedText({
  headline,
  supporting,
  detail,
  detailTitle,
  whyLabel = WHY_LABEL,
  presentation = 'inline',
  tone = 'default',
  size = 'body',
  headlineVariant,
  testID,
}: ExplainedTextProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasDetail = detail !== undefined && detail !== null && paragraphs(detail).length > 0;
  return (
    <View style={styles.explained} testID={testID}>
      <Text variant={headlineVariant ?? (size === 'body' ? 'bodyStrong' : 'subhead')} weight={headlineVariant ? undefined : 'semibold'} tone={HEADLINE_TONE[tone]} testID={testID ? `${testID}-headline` : undefined}>
        {headline}
      </Text>
      {supporting ? (
        <Text variant="footnote" tone="secondary" testID={testID ? `${testID}-supporting` : undefined}>
          {supporting}
        </Text>
      ) : null}
      {hasDetail && presentation === 'inline' ? (
        <Disclosure label={whyLabel} expandedLabel={whyLabel} accessibilityHint={headline} testID={testID ? `${testID}-why` : undefined}>
          <DetailBody detail={detail} testID={testID ? `${testID}-detail` : undefined} />
        </Disclosure>
      ) : null}
      {hasDetail && presentation === 'sheet' ? (
        <>
          <View style={styles.sheetLink}>
            <Button
              label={whyLabel}
              variant="tertiary"
              size="sm"
              accessibilityHint={headline}
              onPress={() => setSheetOpen(true)}
              testID={testID ? `${testID}-why` : undefined}
            />
          </View>
          <Sheet visible={sheetOpen} title={detailTitle ?? headline} onClose={() => setSheetOpen(false)} testID={testID ? `${testID}-sheet` : undefined}>
            <DetailBody detail={detail} testID={testID ? `${testID}-detail` : undefined} />
          </Sheet>
        </>
      ) : null}
    </View>
  );
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

interface NoticeLook {
  readonly background: ColorToken;
  readonly border: ColorToken;
  readonly icon: IconName;
  readonly iconColor: ColorToken;
}

export const NOTICE_LOOKS: { readonly [K in NoticeTone]: NoticeLook } = {
  info: { background: 'accentSubtle', border: 'accent', icon: 'info', iconColor: 'accent' },
  success: { background: 'successSubtle', border: 'success', icon: 'circle-check', iconColor: 'success' },
  warning: { background: 'warningSubtle', border: 'warning', icon: 'triangle-alert', iconColor: 'warning' },
  danger: { background: 'dangerSubtle', border: 'danger', icon: 'circle-alert', iconColor: 'danger' },
};

export interface InlineNoticeProps {
  readonly tone: NoticeTone;
  readonly headline: string;
  readonly supporting?: string | null;
  readonly detail?: DetailContent | null;
  readonly detailTitle?: string;
  readonly whyLabel?: string;
  readonly presentation?: DetailPresentation;
  readonly action?: StateAction;
  readonly icon?: IconName;
  readonly testID?: string;
}

export function InlineNotice({ tone, headline, supporting, detail, detailTitle, whyLabel, presentation = 'inline', action, icon, testID }: InlineNoticeProps) {
  const theme = useTheme();
  const look = NOTICE_LOOKS[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[
        styles.notice,
        {
          backgroundColor: theme.color[look.background],
          borderRadius: theme.radius.lg,
          borderLeftWidth: theme.borderWidth.bar,
          borderLeftColor: theme.color[look.border],
        },
      ]}
    >
      <Icon name={icon ?? look.icon} size={20} color={look.iconColor} />
      <View style={styles.noticeText}>
        <ExplainedText
          headline={headline}
          supporting={supporting}
          detail={detail}
          detailTitle={detailTitle}
          whyLabel={whyLabel}
          presentation={presentation}
          size="subhead"
          testID={testID ? `${testID}-text` : undefined}
        />
        {action ? (
          <View style={styles.noticeAction}>
            <Button label={action.label} onPress={action.onPress} variant="tertiary" size="sm" testID={action.testID} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disclosure: { alignSelf: 'stretch', gap: space.xxs },
  toggle: { alignSelf: 'flex-start', minHeight: TOGGLE_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xxs },
  body: { paddingTop: space.xxs },
  detail: { gap: space.xs },
  explained: { alignSelf: 'stretch', gap: space.xxs, minWidth: 0 },
  sheetLink: { alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm, paddingRight: space.sm },
  noticeText: { flex: 1, minWidth: 0, gap: space.xxs },
  noticeAction: { alignSelf: 'flex-start' },
});
