/**
 * The React and Ink instances `@fx/chat-ink` renders with, handed in by the
 * host through `createChatInk({ React, ink })` rather than imported. A
 * terminal tool that loads plugins (tx) gives each plugin its own React and
 * Ink, and a tree can only be rendered by one instance of each — so this
 * package never loads a copy of its own.
 *
 * The bindings are live: modules read them when they render, not when they
 * load. One process holds one binding; binding again with the same instances
 * is a no-op, with different ones an error.
 */
import { type CoreHooks, createCoreHooks } from '@fx/chat-core/hooks'

export type ReactApi = typeof import('react')
export type InkApi = typeof import('ink')

/** What a host hands in. */
export interface ChatInkDeps {
  React: ReactApi
  ink: InkApi
}

const UNBOUND =
  '@fx/chat-ink is not bound to React and Ink yet: call createChatInk({ React, ink }) first.'

/** A stand-in that names the missing call on any use. */
export function unbound<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      throw new Error(UNBOUND)
    },
  })
}

export let React: ReactApi = unbound<ReactApi>()
export let ink: InkApi = unbound<InkApi>()
/** The core render hooks, bound to the host's React. */
export let hooks: CoreHooks = unbound<CoreHooks>()

let bound: ChatInkDeps | undefined

/** Bind the package to the host's React and Ink. */
export function bindRuntime(deps: ChatInkDeps): void {
  if (bound) {
    if (bound.React === deps.React && bound.ink === deps.ink) return
    throw new Error(
      '@fx/chat-ink is already bound to other React and Ink instances; one process renders with one.',
    )
  }
  bound = deps
  React = deps.React
  ink = deps.ink
  hooks = createCoreHooks(deps.React)
}

/** Whether `createChatInk` has run. */
export function isBound(): boolean {
  return bound !== undefined
}
