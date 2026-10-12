import { stripControls } from '@fx-/chat-ink'

/**
 * The tool-call arguments as the approval prompt shows them. They come from
 * the model, so the text is cleaned of terminal controls (JSON escapes C0 but
 * passes DEL and the C1 range, including the 8-bit CSI), and serialising can
 * fail (cycles, BigInt) or yield nothing (`undefined`): then a plain notice.
 */
export function approvalArguments(args: unknown): string {
  try {
    const json = JSON.stringify(args, null, 2)
    return typeof json === 'string' ? stripControls(json) : '(no arguments)'
  } catch {
    return '(arguments could not be shown)'
  }
}
