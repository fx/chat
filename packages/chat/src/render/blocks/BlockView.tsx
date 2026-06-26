/**
 * `BlockView` — dispatch a single block to its renderer.
 *
 * Dispatch precedence (EXACT):
 *   1. `tool_call` whose `name` is in `extensions.toolRenderers` → host tool
 *      renderer (rendered INSTEAD of the default tool block);
 *   2. core `block.type` → the dedicated default renderer;
 *   3. custom `block.type` in `extensions.blockRenderers` → host block renderer;
 *   4. otherwise → the inert fallback (never throws).
 *
 * With no `extensions` prop, steps 1 and 3 never match, so a core block renders
 * exactly as before and an unknown block falls through to the inert placeholder.
 * The renderer NEVER parses content strings to discover structure; it switches on
 * the discriminant only.
 */
import type { ChatMessage, ContentBlock } from '../../model'
import type { ChatExtensions, CustomBlock, RenderableBlock } from '../extensions'
import { isCoreBlockType, lookupExtension } from '../extensions'
import { InertBlockView } from './InertBlock'
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
  /**
   * The owning message — supplied to host block/tool renderers via
   * `extensions`. Only needed when `extensions` is in play; core renderers
   * ignore it.
   */
  message?: ChatMessage
  /** Raw/debug mode — the inert fallback surfaces unknown blocks as JSON. */
  raw?: boolean
}

/** Props for {@link BlockView}. */
export interface BlockViewProps {
  block: RenderableBlock
  context: BlockRenderContext
  /** Optional render-layer extensions (host block/tool renderers). */
  extensions?: ChatExtensions
}

/** Renders a core content block via its dedicated renderer. */
function CoreBlockView({
  block,
  context,
  blockActive,
}: {
  block: ContentBlock
  context: BlockRenderContext
  blockActive: boolean
}) {
  const { role, startedAt, durationMs, tokensPerSecond, defaultOpen } = context
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
      // A new core `ContentBlock` variant without a branch fails to type-check.
      const _exhaustive: never = block
      return _exhaustive
    }
    /* c8 ignore stop */
  }
}

/** Dispatches a single content block to its renderer (see precedence above). */
export function BlockView({ block, context, extensions }: BlockViewProps) {
  // A block is the streaming one only when the message is active AND this block
  // is the designated active (trailing) block. Earlier blocks render idle.
  const blockActive = Boolean(context.isActive) && block.id === context.activeBlockId

  // (1) Tool-name override wins over the default tool block.
  if (block.type === 'tool_call') {
    const toolBlock = block as Extract<ContentBlock, { type: 'tool_call' }>
    const ToolRenderer = lookupExtension(extensions?.toolRenderers, toolBlock.name)
    if (ToolRenderer && context.message) {
      return <ToolRenderer block={toolBlock} message={context.message} isStreaming={blockActive} />
    }
  }

  // (2) Core type → default renderer.
  if (isCoreBlockType(block.type)) {
    return (
      <CoreBlockView block={block as ContentBlock} context={context} blockActive={blockActive} />
    )
  }

  // (3) Custom type → host block renderer.
  const CustomRenderer = lookupExtension(extensions?.blockRenderers, block.type)
  if (CustomRenderer && context.message) {
    return (
      <CustomRenderer
        block={block as CustomBlock}
        message={context.message}
        isStreaming={blockActive}
      />
    )
  }

  // (4) Inert fallback — never throws, with or without `extensions`.
  return <InertBlockView block={block} {...(context.raw ? { raw: true } : {})} />
}
