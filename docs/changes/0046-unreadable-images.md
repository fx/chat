# 0046: Unreadable Images

## Summary

When a picked image cannot be read, the Android app no longer fails silently. Picked files are read independently: the readable ones attach, and a line above the composer says how many could not be read and to pick them again. The line clears on the next pick that reads every image (picking again is the fix after a failed picker grant) or on send.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0021, 0045

## Motivation

1. Reading a picked photo can fail. On the emulator, the photo picker's first grant failed ("Failed to prepare synthetic picker path") and the WebView's read threw `NotFoundError`.
2. The picked files were read with `Promise.all`, so one failure rejected the whole pick. The rejection was unhandled: nothing was attached, the readable images were lost with the unreadable one, and nothing was said.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- `readAttachments(files)` reads every picked file independently (`Promise.allSettled`) and returns the readable image attachments and the number of files that could not be read. Non-images are skipped, not counted as failures.
- When any file could not be read, a `role="alert"` line above the composer says so: "Couldn’t read that image. Try picking it again." for one, "Couldn’t read N of those images. Try picking them again." for several (`unreadable(count)`).
- The readable images attach as before. The line clears on the next pick that reads every image, or on send; a later pick with unreadable images replaces it with that pick's count.

## Design

### Decisions

- **Count, don't throw.** A failed read is an expected outcome of the platform picker, so it is reported as data (`failed`) rather than as a rejection the screen would have to catch.
- **Keep what was readable.** One bad file must not discard the others the user picked.
- **App-only.** Reading files (`readAttachments`, `usePickedImages`) and the error line live in `apps/mobile/src/screens/Conversation.tsx`; no package changes. The composer from `@fx/chat` is used unchanged through its public export.

### Non-Goals

Retrying reads automatically; attachment thumbnails; working around the picker's grant failure itself.

## Tasks

- [x] `readAttachments` with `Promise.allSettled`; `unreadable` message
- [x] `role="alert"` line above the composer, cleared by a pick that reads every image or on send (`usePickedImages`)
- [x] Tests (`Conversation.test.ts`); mobile-app spec and indexes
