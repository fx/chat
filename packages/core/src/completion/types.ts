/**
 * Completion-provider contract — DOM-free and safe to import outside the
 * browser (server, edge, tests). This module declares ONLY types: there is no
 * runtime code, no React, no DOM. The `icon` slot is generic (`TIcon`,
 * default `unknown`); renderer packages specialize it (`@fx/chat` uses
 * `ReactNode`) so the contract never depends on a UI framework.
 *
 * A provider is a small, self-contained strategy object that the completion
 * popup drives:
 *  - {@link CompletionProvider.match} decides whether the caret currently sits
 *    inside an active token (and what the query + token range are),
 *  - {@link CompletionProvider.items} resolves candidate items for that query
 *    (synchronously, or asynchronously honoring an `AbortSignal`), and
 *  - {@link CompletionProvider.apply} rewrites the full textarea value + caret
 *    when an item is chosen.
 *
 * The package ships exactly one reference provider (see `./reference`); hosts
 * supply their own (agent/model/tool pickers, server fetches, …) — none of
 * which live in this package.
 */
/**
 * A single completion candidate. Carries at least a stable `id` and a display
 * `label`; `description` and `icon` are optional host-rendered embellishments.
 * The `icon` is an opaque renderer node — the contract never renders it, the
 * renderer's popup does.
 *
 * @typeParam TIcon - the renderer's node type for `icon`.
 */
export interface CompletionItem<TIcon = unknown> {
  /** Stable identity within a result set; usable as a render key. */
  id: string
  /** Primary display text. */
  label: string
  /** Optional secondary text shown beside/under the label. */
  description?: string
  /** Optional host-rendered icon node. */
  icon?: TIcon
}

/**
 * The result of {@link CompletionProvider.match}: the active query (the token
 * text after the trigger) and the half-open token `range` it occupies.
 *
 * `range` is `[start, end]` where `start` is the index of the trigger char and
 * `end` is the index one past the last token char — i.e. it INCLUDES the
 * trigger and covers the WHOLE token. Callers slice `before = text.slice(0,
 * start)` and `after = text.slice(end)` to splice in a replacement.
 */
export interface CompletionMatch {
  /** Token text after the trigger char (may be empty right after the trigger). */
  query: string
  /** Half-open `[start, end]` token range, trigger char included. */
  range: [number, number]
}

/**
 * The result of {@link CompletionProvider.apply}: the new FULL textarea value
 * and the caret offset to place within it.
 */
export interface CompletionApplyResult {
  /** The complete replacement value for the textarea. */
  value: string
  /** Caret offset (in `value`) to place after applying. */
  caret: number
}

/**
 * A completion strategy. Implementations are pure with respect to the DOM: they
 * operate on the textarea's string value + caret offset only, so they are fully
 * testable without a browser.
 *
 * @typeParam TItem - the item shape this provider yields (defaults to the base
 *   {@link CompletionItem}).
 */
export interface CompletionProvider<TItem extends CompletionItem = CompletionItem> {
  /** Stable identity — used for precedence diagnostics and React keys. */
  id: string
  /**
   * Single trigger character used as a cheap pre-filter before `match()` runs.
   * MUST be exactly one character.
   */
  trigger: string
  /**
   * Decide whether the caret currently sits inside an active token for this
   * provider. Returns the {@link CompletionMatch} (query + token range) or
   * `null` when there is no active token.
   */
  match(text: string, caret: number): CompletionMatch | null
  /**
   * Resolve candidate items for `query`. MAY return synchronously (array) or
   * asynchronously (promise). Async implementations MUST honor `signal` —
   * aborting in-flight work and rejecting/resolving promptly when it fires — so
   * the popup can discard stale queries.
   */
  items(query: string, signal: AbortSignal): Promise<TItem[]> | TItem[]
  /**
   * Produce the new full value + caret when `item` is applied. `before` is the
   * text preceding the token's trigger char; `after` is the text following the
   * token. The provider decides how the item is serialized (and conventionally
   * appends a trailing space — see the reference provider).
   */
  apply(item: TItem, before: string, after: string): CompletionApplyResult
}
