/**
 * Headless inline-SVG icon set.
 *
 * Every {@link IconName} maps to a self-contained inline SVG — no icon library
 * dependency. Each icon accepts `className` and `size` (default 16) and is
 * SSR-safe (pure render, no `window`). Strokes/fills use `currentColor` so the
 * surrounding text color drives the icon color; hosts can restyle via CSS.
 */
import type { ReactNode } from 'react'
import type { IconName, IconProps, IconRegistry, OptionalIconName } from '../contract'

const DEFAULT_SIZE = 16

/**
 * Shared SVG wrapper. Centralizes the viewBox, sizing, color inheritance, and
 * accessibility attributes so each icon body only declares its paths.
 */
function Svg({ className, size, children }: IconProps & { children: ReactNode }) {
  const dimension = size ?? DEFAULT_SIZE
  return (
    <svg
      className={className}
      width={dimension}
      height={dimension}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      {children}
    </svg>
  )
}

const Spinner = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" opacity={0.9} />
  </Svg>
)

const Checklist = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 4l1.5 1.5L6 3M2 10l1.5 1.5L6 9M8 4.5h6M8 10.5h6" />
  </Svg>
)

const Info = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.5v3.5M8 5h.01" />
  </Svg>
)

const Check = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8.5l3 3 7-7" />
  </Svg>
)

const CaretRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 3l5 5-5 5" />
  </Svg>
)

const CaretDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 6l5 5 5-5" />
  </Svg>
)

const Copy = (props: IconProps) => (
  <Svg {...props}>
    <rect x={5.5} y={5.5} width={8} height={8} rx={1.5} />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </Svg>
)

const Wrench = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10.5 2.5a3 3 0 0 0-3.7 3.9L2.5 10.7l1.8 1.8 4.3-4.3a3 3 0 0 0 3.9-3.7l-1.7 1.7-1.6-.4-.4-1.6z" />
  </Svg>
)

const Brain = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 2.5A2 2 0 0 0 4 4.5a2 2 0 0 0-1 3.5 2 2 0 0 0 1 3.5 2 2 0 0 0 2 2V2.5z" />
    <path d="M10 2.5a2 2 0 0 1 2 2 2 2 0 0 1 1 3.5 2 2 0 0 1-1 3.5 2 2 0 0 1-2 2V2.5z" />
  </Svg>
)

const Gear = (props: IconProps) => (
  <Svg {...props}>
    <circle cx={8} cy={8} r={2} />
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
  </Svg>
)

const DotsThree = (props: IconProps) => (
  <Svg {...props}>
    <circle cx={3.5} cy={8} r={1} fill="currentColor" stroke="none" />
    <circle cx={8} cy={8} r={1} fill="currentColor" stroke="none" />
    <circle cx={12.5} cy={8} r={1} fill="currentColor" stroke="none" />
  </Svg>
)

const Regenerate = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13 8a5 5 0 1 1-1.5-3.5" />
    <path d="M13 2.5V5h-2.5" />
  </Svg>
)

const Fork = (props: IconProps) => (
  <Svg {...props}>
    <circle cx={4} cy={3.5} r={1.5} />
    <circle cx={12} cy={3.5} r={1.5} />
    <circle cx={8} cy={12.5} r={1.5} />
    <path d="M4 5v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5M8 9v2" />
  </Svg>
)

const Reset = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8a5 5 0 1 0 1.5-3.5" />
    <path d="M3 2.5V5h2.5" />
  </Svg>
)

const File = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 1.5h5L13 5v9.5H4z" />
    <path d="M9 1.5V5h4" />
  </Svg>
)

const Audio = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 6v4h2l3 2.5v-9L5 6z" />
    <path d="M10.5 5.5a3 3 0 0 1 0 5" />
  </Svg>
)

const Video = (props: IconProps) => (
  <Svg {...props}>
    <rect x={1.5} y={4} width={9} height={8} rx={1.5} />
    <path d="M10.5 7l4-2.5v7L10.5 9z" />
  </Svg>
)

const Send = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 2L2 7l4.5 1.8L8.5 13 14 2z" />
    <path d="M6.5 8.8L14 2" />
  </Svg>
)

const Stop = (props: IconProps) => (
  <Svg {...props}>
    <rect x={4} y={4} width={8} height={8} rx={1} fill="currentColor" stroke="none" />
  </Svg>
)

const Paperclip = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 6.5l-5 5a2.5 2.5 0 0 1-3.5-3.5l5.5-5.5a1.5 1.5 0 0 1 2 2L5.5 10" />
  </Svg>
)

const Close = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Svg>
)

const Download = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5" />
    <path d="M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Svg>
)

const Expand = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 2.5H2.5V6M10 13.5h3.5V10M13.5 6V2.5H10M2.5 10v3.5H6" />
  </Svg>
)

/**
 * The complete headless icon registry — one inline SVG per {@link IconName}.
 * Frozen so the shared default cannot be mutated by a consumer.
 */
export const headlessIcons: IconRegistry = Object.freeze({
  spinner: Spinner,
  check: Check,
  caretRight: CaretRight,
  caretDown: CaretDown,
  copy: Copy,
  wrench: Wrench,
  brain: Brain,
  gear: Gear,
  dotsThree: DotsThree,
  regenerate: Regenerate,
  fork: Fork,
  reset: Reset,
  file: File,
  audio: Audio,
  video: Video,
  send: Send,
  stop: Stop,
  paperclip: Paperclip,
  close: Close,
  download: Download,
  expand: Expand,
  checklist: Checklist,
  info: Info,
}) as IconRegistry

/** Ordered list of every icon name the headless set ships. */
export const HEADLESS_ICON_NAMES = Object.keys(headlessIcons) as Array<IconName | OptionalIconName>
