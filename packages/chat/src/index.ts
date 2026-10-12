/**
 * `@fx-/chat` — framework-light, design-system-agnostic React components for
 * rendering and composing LLM chat conversations.
 *
 * This is the bootstrap surface. Feature changes (message model, component
 * registry, rendering, input composer) flesh out the real exports. For now the
 * root entry ships the package version and a tiny pure class-name joiner so the
 * build, type declarations, and import smoke tests have real, covered code to
 * exercise.
 */

/**
 * The published package version. Kept in lockstep with `package.json` — the
 * smoke test (`smoke.test.ts`) asserts `version === package.json.version`, so
 * any drift fails CI rather than shipping silently.
 */
export const version = '0.0.0' // x-release-please-version

/**
 * The message model, codec, and mention helpers live in `@fx-/chat-core` and are
 * re-exported unchanged so existing host imports keep working.
 */
export type {
  Attachment,
  ChatMessage,
  ContentBlock,
  HostAttachment,
  HostMessage,
  HostToolCall,
  MentionRange,
  MentionSegment,
  MessageMetrics,
  MessageOutcome,
  NormalizeMapping,
  ReasoningBlock,
  Role,
  Segment,
  StatusBlock,
  SystemBlock,
  TextBlock,
  ToolCallBlock,
  ToolApproval,
  ToolKind,
  ToolMedia,
  ToolStatus,
} from '@fx-/chat-core'
export {
  ChatMessageAssertionError,
  assertChatMessage,
  attachmentKind,
  deepParseJson,
  defaultToolStatus,
  mentionsToSegments,
  normalizeMessage,
  normalizeTranscript,
  parseMentions,
  toJsonSafe,
} from '@fx-/chat-core'

/**
 * The `clsx`-style class-name joiner + its value type. Implemented in the
 * dependency-free `./cx` leaf module so the render/input layers can import it
 * without an import cycle through this barrel; re-exported here so the public
 * surface (`import { cx } from '@fx-/chat'`) is unchanged.
 */
export { cx } from './cx'
export type { ClassValue } from './cx'

export * from './registry'

export * from './render'

export * from './input'
