/**
 * Streaming splitter for inline `<think>…</think>` reasoning spans.
 *
 * Some models emit their reasoning inside the content stream wrapped in think
 * tags instead of a dedicated delta field. Tags can be split across chunks at
 * any character, so the splitter holds back a trailing fragment that could be
 * the start of a tag until the next chunk disambiguates it.
 */

/** A piece of content classified as reasoning or answer text. */
export interface ThinkPiece {
  kind: 'text' | 'reasoning'
  text: string
}

const OPEN = '<think>'
const CLOSE = '</think>'

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagSuffix(text: string, tag: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len
  }
  return 0
}

export class ThinkSplitter {
  private inThink = false
  private pending = ''

  /** Feed a content chunk; returns the pieces that are now unambiguous. */
  push(chunk: string): ThinkPiece[] {
    let text = this.pending + chunk
    this.pending = ''
    const out: ThinkPiece[] = []
    for (;;) {
      const tag = this.inThink ? CLOSE : OPEN
      const at = text.indexOf(tag)
      if (at === -1) {
        const hold = partialTagSuffix(text, tag)
        this.emit(out, text.slice(0, text.length - hold))
        this.pending = text.slice(text.length - hold)
        return out
      }
      this.emit(out, text.slice(0, at))
      text = text.slice(at + tag.length)
      this.inThink = !this.inThink
    }
  }

  /** Release any held-back fragment at end of stream. */
  flush(): ThinkPiece[] {
    const out: ThinkPiece[] = []
    this.emit(out, this.pending)
    this.pending = ''
    return out
  }

  private emit(out: ThinkPiece[], text: string): void {
    if (text) out.push({ kind: this.inThink ? 'reasoning' : 'text', text })
  }
}
