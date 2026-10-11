/**
 * Lucide icon map — maps every library {@link IconName} to a `lucide-react`
 * component, adapting lucide's `size`/`className` props to the library's
 * {@link IconProps} contract.
 *
 * The icon set is host-injected: the library references icons only by
 * semantic name and never depends on an icon package.
 */
import type { IconName, IconProps, IconRegistry, OptionalIconName } from '@fx/chat'
import {
  AudioLines,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitFork,
  ListChecks,
  Loader2,
  type LucideIcon,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Settings,
  Square,
  Video,
  Wrench,
  X,
} from 'lucide-react'

/** Wrap a lucide component as a library {@link IconProps} icon. */
function wrap(Icon: LucideIcon) {
  return function WrappedIcon({ className, size }: IconProps) {
    return <Icon className={className} size={size ?? 16} aria-hidden />
  }
}

const MAP: Record<IconName | OptionalIconName, LucideIcon> = {
  checklist: ListChecks,
  spinner: Loader2,
  check: Check,
  caretRight: ChevronRight,
  caretDown: ChevronDown,
  copy: Copy,
  wrench: Wrench,
  brain: Brain,
  gear: Settings,
  dotsThree: MoreHorizontal,
  regenerate: RefreshCw,
  fork: GitFork,
  reset: RotateCcw,
  file: FileText,
  audio: AudioLines,
  video: Video,
  send: SendHorizontal,
  stop: Square,
  paperclip: Paperclip,
  close: X,
  download: Download,
  expand: Maximize2,
}

/** The full lucide icon registry, one component per {@link IconName}. */
export const lucideIcons: IconRegistry = Object.fromEntries(
  (Object.keys(MAP) as IconName[]).map((name) => [name, wrap(MAP[name])]),
) as IconRegistry
