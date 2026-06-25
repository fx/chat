/**
 * `BlockView` — exhaustive dispatch on `block.type` to the dedicated renderer.
 *
 * The renderer NEVER parses content strings to discover structure; it switches
 * on the discriminant only. The `default` branch is a compile-time exhaustive
 * check (`never`) plus a runtime guard.
 */
import type { ContentBlock } from '../../model'
import { ReasoningBlockView } from './ReasoningBlock'
import { StatusBlockView } from './StatusBlock'
import { SystemBlockView } from './SystemBlock'
import { TextBlockView } from './TextBlock'
import { ToolCallBlockView } from './ToolCallBlock'

/** Streaming/timing context applied to the active block of an active message. */
export interface BlockRenderContext {
  /** Owning message role. */
  role: 'system' | 'user' | 'assistant'
  /** Whether the owning message is actively streaming. */
  isActive?: boolean
  /**
   * The id of the single block that is currently streaming within an active
   * message (its trailing block). Only this block shows spinner/live timers;
   * earlier blocks — even a durationless completed reasoning — render idle.
   */
  activeBlockId?: string
  /** Epoch-ms start of the active generation. */
  startedAt?: number
  /** Finalized message duration in ms. */
  durationMs?: number
  /** Live/finalized tokens-per-second. */
  tokensPerSecond?: number
  /** Default-open state for collapsibles (verbose/expand-all). */
  defaultOpen?: boolean
}

/** Props for {@link BlockView}. */
export interface BlockViewProps {
  block: ContentBlock
  context: BlockRenderContext
}

/** Dispatches a single content block to its dedicated renderer. */
export function BlockView({ block, context }: BlockViewProps) {
  const { role, isActive, activeBlockId, startedAt, durationMs, tokensPerSecond, defaultOpen } =
    context
  // A block is the streaming one only when the message is active AND this block
  // is the designated active (trailing) block. Earlier blocks render idle.
  const blockActive = Boolean(isActive) && block.id === activeBlockId
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} messageRole={role} streaming={blockActive} />
    case 'reasoning':
      return (
        <ReasoningBlockView
          block={block}
          isActive={blockActive && block.durationMs === undefined}
          startedAt={startedAt}
          defaultOpen={defaultOpen}
        />
      )
    case 'tool_call':
      return <ToolCallBlockView block={block} defaultOpen={defaultOpen} />
    case 'status':
      return (
        <StatusBlockView
          block={block}
          isActive={blockActive}
          startedAt={startedAt}
          durationMs={durationMs}
          tokensPerSecond={tokensPerSecond}
        />
      )
    case 'system':
      return <SystemBlockView block={block} defaultOpen={defaultOpen} />
    /* c8 ignore start -- compile-time exhaustiveness guard; unreachable at runtime */
    default: {
      // A new `ContentBlock` variant without a branch fails to type-check here.
      const _exhaustive: never = block
      return _exhaustive
    }
    /* c8 ignore stop */
  }
}
