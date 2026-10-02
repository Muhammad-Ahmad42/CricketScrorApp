import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CloudRain,
  Ellipsis,
  FileText,
  HardDriveDownload,
  History,
  House,
  Info,
  Minus,
  Pause,
  PencilLine,
  Play,
  Plus,
  Redo2,
  Search,
  Settings,
  Share,
  Trash2,
  TriangleAlert,
  Trophy,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Platform } from 'react-native';
import { useTheme, type ColorToken } from '../theme';

export const ICONS = {
  'arrow-left-right': ArrowLeftRight,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-dot': CircleDot,
  'cloud-rain': CloudRain,
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
