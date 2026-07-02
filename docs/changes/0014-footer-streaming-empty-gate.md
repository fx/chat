# 0014: Footer Streaming/Empty Gate

## Summary

Gate the assistant message footer on COMPLETION and CONTENT: `MessageItem` renders the footer
affordances (copy, regenerate/fork/reset, metrics) only for a NON-ACTIVE (`!isActive`) assistant
message that has at least one block. While a message is actively streaming (`isActive` — in
`MessageLog` terms, `isStreaming && message.id === streamingMessageId`) or when it has ZERO blocks
(a just-created streaming placeholder), the footer MUST NOT render. Previously the footer rendered
for every assistant message, so an empty placeholder showed a dangling footer (a copy button with
nothing to copy) and a streaming turn showed regenerate/fork affordances for an answer that did not
exist yet.

Review follow-up: the copy affordance is additionally gated on CONTENT — `MessageFooter` renders
the `CopyButton` only when `copyText` contains non-whitespace characters (`copyText.trim()` is
non-empty; a whitespace-only payload counts as empty). A tool-call-only assistant turn
settles with blocks (so the footer renders) but has an empty copy payload; a Copy button that
copies `''` is exactly the papercut this change removes. The spec's affordance MUSTs are qualified
by the footer visibility gate, and host responsibilities are documented: hosts must terminalize
runs (clear `isStreaming`/`streamingMessageId`, including on error), and a turn that settles with
zero blocks renders no footer — hosts wanting a retry affordance there must surface an error block
or their own UI.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0004

## Motivation

When a host appends an empty assistant placeholder at stream start, the footer appeared immediately
— before any content — and stayed visible during streaming. The affordances are completion actions:
copying, regenerating, or forking a message mid-stream is at best meaningless and at worst
destructive. The reference chat shows the footer only once the turn has settled.

## Tasks

- [x] `MessageItem`: footer gate extended with `!isActive && message.blocks.length > 0`; doc
      comment updated
- [x] `MessageItem.test.tsx`: empty-blocks → no footer; `isActive` → no footer; explicit
      `isActive={false}` → footer present
- [x] `MessageLog.test.tsx`: integration test — completed + streaming assistant messages render
      exactly ONE footer, inside the completed message's `[data-message-id]` wrapper
- [x] Spec: message-rendering §Affordances requirement + scenario + changelog row
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0014
- [x] `MessageFooter`: `CopyButton` rendered only for non-empty `copyText`; doc comment updated
      (copy needs no host callback but requires copyable text)
- [x] `MessageFooter.test.tsx`: empty `copyText` → no Copy control, other affordances intact
- [x] `MessageItem.test.tsx`: tool-call-only assistant turn → footer renders, no Copy button
- [x] Spec: affordance MUSTs qualified by the footer visibility gate; copy bullet gated on
      non-empty copyable text; host-responsibilities note (terminalize runs; zero-block turns
      render no footer) + changelog row
- [x] `MessageFooter`: zero-affordance early return — renders `null` when there is no copyable
      (non-whitespace) text, no action callbacks, and no renderable metrics; copy gated on
      `copyText.trim()` (whitespace-only payloads show no Copy control); tests for the null
      render, whitespace-only copy, and single-affordance footers
- [x] `MessageFooter`: zero-affordance decision extracted into the exported pure predicate
      `hasFooterContent` (non-whitespace copy text OR any callback OR renderable metrics); the
      early return stays as the safety net for direct consumers
- [x] `MessageItem`: footer branch — including the `timestampGutter` `wrapRow` wrapper — gated on
      `hasFooterContent`, so a zero-affordance turn emits no empty `.chat-gutter-row` with a
      blank clock cell; gutter-hygiene test (tool-call-only turn + `timestampGutter` → gutter-row
      count equals block-row count) and direct `hasFooterContent` unit coverage

## Changelog

- **2026-07-02** — Initial change: footer suppressed while `isActive` or when the assistant message
  has zero blocks.
- **2026-07-02** — Review follow-up: copy affordance gated on non-empty `copyText` (tool-call-only
  turns show no Copy button); spec affordance MUSTs cross-reference the footer visibility gate and
  document host responsibilities (terminalize runs; zero-block settled turns render no footer).
- **2026-07-02** — Review follow-up 2: zero-affordance early return — `MessageFooter` renders
  nothing at all when it has no copyable (non-whitespace) text, no action callbacks, and no
  renderable metrics; whitespace-only `copyText` is treated as empty (`copyText.trim()` gate),
  while the raw text remains the copied value.
- **2026-07-02** — Review follow-up 3: the empty-footer gate now also suppresses the timestamp-
  gutter wrapper — `MessageItem` gates its whole footer branch (including the `wrapRow` gutter
  row) on the exported pure predicate `hasFooterContent`, so a zero-affordance turn with
  `timestampGutter` no longer emits a stray empty `.chat-gutter-row` with a blank clock cell;
  `MessageFooter` keeps the same predicate as its safety-net early return.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md)
