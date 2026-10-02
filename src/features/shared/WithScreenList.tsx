import type { ReactNode } from 'react';
import { useScreenList, type ScreenList } from '@/ui';

export interface WithScreenListProps {
  readonly children: (list: ScreenList) => ReactNode;
}

export function WithScreenList({ children }: WithScreenListProps) {
  return children(useScreenList());
}
