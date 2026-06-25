/**
 * The complete headless default registry.
 *
 * Assembles every primitive, the inline-SVG icon set, and the minimal safe
 * Markdown renderer into a single {@link ChatComponents} value. It carries
 * zero design-system / icon / markdown-engine dependencies — only React — so
 * `<ChatProvider>` with no `components` renders the full surface unstyled and
 * self-contained.
 */
import type { ChatComponents } from '../contract'
import { headlessIcons } from './icons'
import { HeadlessMarkdown } from './markdown'
import {
  Avatar,
  Badge,
  Button,
  CodeBlock,
  Collapsible,
  CopyButton,
  JsonView,
  ScrollArea,
  Tooltip,
} from './primitives'

/** The headless default {@link ChatComponents} registry. */
export const headlessComponents: ChatComponents = {
  Button,
  Badge,
  Tooltip,
  Collapsible,
  CodeBlock,
  JsonView,
  ScrollArea,
  Avatar,
  CopyButton,
  Markdown: HeadlessMarkdown,
  icons: headlessIcons,
}

export { headlessIcons, HEADLESS_ICON_NAMES } from './icons'
export { HeadlessMarkdown, parseBlocks } from './markdown'
export {
  Avatar,
  Badge,
  Button,
  CodeBlock,
  Collapsible,
  CopyButton,
  JsonView,
  ScrollArea,
  Tooltip,
} from './primitives'
