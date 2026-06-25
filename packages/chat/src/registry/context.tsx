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
import type { ChatComponents, PartialChatComponents } from './contract'
import { headlessComponents } from './headless'

/**
 * Context holding the effective registry. `null` means "no provider above" —
 * `useChatComponents()` then falls back to the headless defaults, so the hook
 * is always safe to call.
 */
const ChatComponentsContext = createContext<ChatComponents | null>(null)

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

/** Props for {@link ChatProvider}. */
export interface ChatProviderProps {
  /** Partial registry merged over the inherited (parent/headless) registry. */
  components?: PartialChatComponents
  children?: ReactNode
}

/**
 * Provides the effective component registry to descendants. With no
 * `components`, behaves exactly as the headless default. When nested, it
 * inherits the parent's effective registry and overrides only the keys it
 * supplies, preserving outer overrides.
 */
export function ChatProvider({ components, children }: ChatProviderProps) {
  const inherited = useContext(ChatComponentsContext) ?? headlessComponents
  const value = useMemo(() => mergeRegistry(inherited, components), [inherited, components])
  return <ChatComponentsContext.Provider value={value}>{children}</ChatComponentsContext.Provider>
}

/**
 * Returns the effective component registry. Safe to call outside any provider —
 * it falls back to the headless defaults so renderers always have a complete
 * registry.
 */
export function useChatComponents(): ChatComponents {
  return useContext(ChatComponentsContext) ?? headlessComponents
}
