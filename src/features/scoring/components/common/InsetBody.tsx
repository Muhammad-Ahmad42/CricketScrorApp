import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useScreenList } from '@/ui';

export function InsetBody({ children }: { readonly children: ReactNode }) {
  const list = useScreenList();
  return <View style={[styles.root, { paddingTop: list.contentInset.paddingTop }]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
