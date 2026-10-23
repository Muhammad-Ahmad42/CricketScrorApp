import type { ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole } from 'react-native';
import { Separator, space, useContentSurface, useGutter, useTheme, type SpaceToken } from '@/ui';
import { useRowBleed } from '@/ui/layout/gutter';

export type BlockAlign = 'start' | 'center' | 'stretch';

const ALIGN = { start: 'flex-start', center: 'center', stretch: 'stretch' } as const;

export interface BlockProps {
  readonly children: ReactNode;
  readonly direction?: 'row' | 'column';
  readonly align?: BlockAlign;
  readonly gap?: SpaceToken;
  readonly padding?: SpaceToken;
  readonly surface?: boolean;
  readonly separator?: boolean;
  readonly compact?: boolean;
  readonly accessible?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly busy?: boolean;
  readonly testID?: string;
}

export function Block({
  children,
  direction = 'column',
  align = 'stretch',
  gap = 'xxs',
  padding = 'sm',
  surface = true,
  separator = false,
  compact = false,
  accessible,
  accessibilityLabel,
  accessibilityRole,
  busy,
  testID,
}: BlockProps) {
  const theme = useTheme();
  const gutter = useGutter();
  const background = useContentSurface();
  const bleed = useRowBleed();
  return (
    <View style={[bleed > 0 ? { marginHorizontal: -bleed } : null, surface ? { backgroundColor: background } : null]}>
      <View
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={busy === undefined ? undefined : { busy }}
        testID={testID}
        style={[
          styles.body,
          {
            flexDirection: direction,
            alignItems: ALIGN[align],
            gap: space[gap],
            paddingHorizontal: gutter,
            paddingVertical: space[padding],
            minHeight: compact ? theme.size.rowCompact : undefined,
          },
        ]}
      >
        {children}
      </View>
      {separator ? <Separator inset={gutter} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { minWidth: 0 },
});
