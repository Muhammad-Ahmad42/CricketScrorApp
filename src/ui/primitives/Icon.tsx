import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import CloudRain from 'lucide-react-native/icons/cloud-rain';
import Clock from 'lucide-react-native/icons/clock';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import FileText from 'lucide-react-native/icons/file-text';
import HardDriveDownload from 'lucide-react-native/icons/hard-drive-download';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import House from 'lucide-react-native/icons/house';
import Info from 'lucide-react-native/icons/info';
import Minus from 'lucide-react-native/icons/minus';
import Pause from 'lucide-react-native/icons/pause';
import PencilLine from 'lucide-react-native/icons/pencil-line';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import Redo2 from 'lucide-react-native/icons/redo-2';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Share from 'lucide-react-native/icons/share';
import Trash2 from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Trophy from 'lucide-react-native/icons/trophy';
import Undo2 from 'lucide-react-native/icons/undo-2';
import X from 'lucide-react-native/icons/x';
import type { LucideIcon } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useTheme, type ColorToken } from '../theme';

export const ICONS = {
  'arrow-left-right': ArrowLeftRight,
  calendar: CalendarDays,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-dot': CircleDot,
  'cloud-rain': CloudRain,
  clock: Clock,
  ellipsis: Ellipsis,
  'file-text': FileText,
  'hard-drive-download': HardDriveDownload,
  history: History,
  house: House,
  info: Info,
  minus: Minus,
  pause: Pause,
  'pencil-line': PencilLine,
  play: Play,
  plus: Plus,
  'redo-2': Redo2,
  search: Search,
  settings: Settings,
  share: Share,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  trophy: Trophy,
  'undo-2': Undo2,
  x: X,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type IconSize = 16 | 20 | 24 | 32;

export interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
  readonly color?: ColorToken;
  readonly testID?: string;
}

export function strokeFor(size: IconSize): number {
  return size <= 16 ? 2 : 1.75;
}

const HIDDEN_GLYPH =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessible: false, importantForAccessibility: 'no' as const, accessibilityElementsHidden: true };

export function Icon({ name, size = 20, color = 'textPrimary', testID }: IconProps) {
  const theme = useTheme();
  const Glyph = ICONS[name];
  return (
    <Glyph
      testID={testID}
      size={size}
      color={theme.color[color]}
      strokeWidth={strokeFor(size)}
      {...HIDDEN_GLYPH}
    />
  );
}
