# 0017: Custom-Block Summary Label

## Summary

A host can now supply a human-readable summary label for a custom (host-defined) block kind.
`CustomBlock` gains an OPTIONAL typed `label?: string` field (a documented duck-field,
mirroring the `startedAt` convention `MessageItem.blockTimestamp` reads), and
`summarizeBlock`'s custom-kind branch prefers that `label` when it is a non-blank string —
otherwise the label falls back to the raw `type`, byte-for-byte the previous behavior. So a
collapsed group whose header summary resolves to e.g. an fx/ai `job-status` block reads
"Job status (+1)" instead of the raw type string "job-status (+1)". Empty-string,
whitespace-only, non-string, and missing labels all fall back to `type`; core kinds, icons,
and timer behavior are unchanged. Purely additive — the `CustomBlock` index signature already admitted the field
untyped; this types the contract and wires it into the header summary.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0007

## Motivation

Hosts inject custom blocks (e.g. fx/ai's `job-status`) that opt into auxiliary grouping via
`extensions.timelineBehavior`. When such a block heads a collapsed disclosure, `summarizeBlock`
labeled it by its raw `type` string — two consecutive `job-status` blocks collapsed to a
disclosure literally labeled "job-status +1", an implementation identifier surfaced as UI
copy. The host already controls the block payload, so an optional label field on the block is
the minimal seam: no new extension map, no renderer changes, safe fallback to the old label.

## Tasks

- [x] `extensions.ts`: `CustomBlock.label?: string` — optional documented field ("used by the
      grouping header when this block heads a collapsed disclosure; falls back to `type`")
- [x] `blockSummary.ts`: custom/unknown-kind branch prefers a non-blank string `label`
      duck-field over `block.type`; doc-block updated
- [x] `blockSummary.test.ts`: custom kind with `label` uses it; empty-string, whitespace-only,
      and non-string `label` fall back to `type`; missing-label case retained
- [x] `BlockGroup.test.tsx`: collapsed header surfaces a custom summary block's host `label`;
      raw-`type` fallback pinned when no `label` is supplied
- [x] `extensions.render.test.tsx`: opted-in custom kind heading a group labels the header
      with its host `label`; `type` fallback pinned via a label-less fixture
- [x] Spec: message-rendering §Renderer Extensibility — custom-kind header-label rule;
      changelog row
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0017

## Changelog

- **2026-07-03** — Initial change: typed optional `CustomBlock.label`; `summarizeBlock`
  prefers a non-empty string `label` over the raw `type` for custom kinds.
- **2026-07-03** — Review fix (CodeRabbit): whitespace-only labels are treated as absent —
  the guard trims before the emptiness check, so a blank `label` falls back to `type`.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0007-render-extensibility](./0007-render-extensibility.md)
