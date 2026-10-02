import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useLiveMatchStore } from '@/stores';
import { commitAnnouncement } from '../selectors/announce';

export function useCommitAnnouncer(): void {
  const live = useLiveMatchStore((s) => s.live);
  const previous = useRef(live);
  useEffect(() => {
    const message = commitAnnouncement(previous.current, live);
    previous.current = live;
    if (message !== null) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [live]);
}
