/**
 * `ChatProvider` and the `useChatComponents()` hook.
 *
 * The provider injects the effective {@link ChatComponents} registry into React
 * context. Its `components` prop is OPTIONAL and partial: supplied entries are
 * merged over the **inherited** registry — the parent provider's effective
 * registry when nested, or the headless defaults at the root. The `icons` map is
 * deep-merged so a host can override a single icon without redeclaring the rest.
 */
import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ChatClassNames, ChatComponents, PartialChatComponents } from './contract'
import { headlessComponents } from './headless'

/**
 * Context holding the effective registry. `null` means "no provider above" —
 * `useChatComponents()` then falls back to the headless defaults, so the hook
 * is always safe to call.
 */
const ChatComponentsContext = createContext<ChatComponents | null>(null)

/**
 * Context holding the effective {@link ChatClassNames} injection map. Defaults to
 * an empty object — with no provider above, {@link useChatClassNames} returns
 * `{}`, so every render component appends nothing and output is byte-identical to
 * the unstyled default. The hook is therefore always safe to call.
 */
const ChatClassNamesContext = createContext<ChatClassNames>({})

/**
 * Merge a partial registry over an inherited one. Primitive slots shallow-merge
 * (supplied wins); the `icons` map deep-merges so unspecified icons are
 * preserved:
 * `{ ...inherited, ...components, icons: { ...inherited.icons, ...components?.icons } }`.
 */
export function mergeRegistry(
  inherited: ChatComponents,
  components?: PartialChatComponents,
): ChatComponents {
  if (!components) return inherited
  return {
    ...inherited,
    ...components,
    icons: { ...inherited.icons, ...components.icons },
  }
}

/**
 * Shallow-merge a partial class-name map over an inherited one (supplied wins),
 * mirroring how {@link mergeRegistry} merges primitive component slots. Returns
 * the inherited map unchanged when nothing is supplied so a no-op provider adds
 * no churn.
 */
export function mergeClassNames(
  inherited: ChatClassNames,
  classNames?: ChatClassNames,
): ChatClassNames {
  if (!classNames) return inherited
  return { ...inherited, ...classNames }
}

/** Props for {@link ChatProvider}. */
export interface ChatProviderProps {
  /** Partial registry merged over the inherited (parent/headless) registry. */
  components?: PartialChatComponents
  /**
   * Host-overridable per-hook class names, shallow-merged over the inherited map
   * (supplied wins). Each render component appends its matching value AFTER the
   * stable `chat-*` class. Absent keys append nothing. OPTIONAL.
   */
  classNames?: ChatClassNames
  children?: ReactNode
}

/**
 * Provides the effective component registry to descendants. With no
 * `components`, behaves exactly as the headless default. When nested, it
 * inherits the parent's effective registry and overrides only the keys it
 * supplies, preserving outer overrides.
 *
 * The optional `classNames` map is threaded through a sibling context (shallow-
 * merged over the inherited map, supplied wins) so descendants can append a
 * host class to every stable `chat-*` hook. With no `classNames`, the injected
 * map stays empty and rendered output is byte-identical to the unstyled default.
 */
export function ChatProvider({ components, classNames, children }: ChatProviderProps) {
  const inherited = useContext(ChatComponentsContext) ?? headlessComponents
  const value = useMemo(() => mergeRegistry(inherited, components), [inherited, components])
  const inheritedClassNames = useContext(ChatClassNamesContext)
  const classNamesValue = useMemo(
    () => mergeClassNames(inheritedClassNames, classNames),
    [inheritedClassNames, classNames],
  )
  return (
    <ChatComponentsContext.Provider value={value}>
      <ChatClassNamesContext.Provider value={classNamesValue}>
        {children}
      </ChatClassNamesContext.Provider>
    </ChatComponentsContext.Provider>
  )
}

/**
 * Returns the effective component registry. Safe to call outside any provider —
 * it falls back to the headless defaults so renderers always have a complete
 * registry.
 */
export function useChatComponents(): ChatComponents {
  return useContext(ChatComponentsContext) ?? headlessComponents
}

/**
 * Returns the effective {@link ChatClassNames} injection map. Safe to call
 * outside any provider — it falls back to an empty object, so a render component
 * appends nothing and produces byte-identical default output.
 */
export function useChatClassNames(): ChatClassNames {
  return useContext(ChatClassNamesContext)
}
