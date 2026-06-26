/**
 * `@fx/chat/headless` — the complete default, unstyled component registry.
 *
 * This entry carries **zero** design-system dependencies: no UI kit, no icon
 * set, no markdown engine — only React. It exposes the full headless
 * {@link ChatComponents} registry (`headlessComponents`), every individual
 * primitive, the inline-SVG icon set, and the minimal safe Markdown renderer,
 * so a host can render `@fx/chat` with no configuration or cherry-pick any slot
 * as a base for an adapter.
 */
export type { ChatComponents, IconName, IconRegistry } from './registry/contract'
export {
  Avatar,
  Badge,
  Button,
  CodeBlock,
  Collapsible,
  CopyButton,
  HEADLESS_ICON_NAMES,
  HeadlessMarkdown,
  headlessComponents,
  headlessIcons,
  JsonView,
  Lightbox,
  parseBlocks,
  ScrollArea,
  Tooltip,
} from './registry/headless'
