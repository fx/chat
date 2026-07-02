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

## Changelog

- **2026-07-02** — Initial change: footer suppressed while `isActive` or when the assistant message
  has zero blocks.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md)
