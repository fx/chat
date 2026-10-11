import { describe, expect, it } from 'vitest'
import { createKeyReportReader, isTerminalReport } from './terminal'

const mouse = '\u001b[<0;3;4M'
const reply = '\u001b[6;18;9t'

describe('isTerminalReport', () => {
  it('needs a digit after `?`, so typed `[?a` is text', () => {
    expect(isTerminalReport('\u001b[?1;2c')).toBe(true)
    expect(isTerminalReport('[?a')).toBe(false)
  })
})

describe('createKeyReportReader', () => {
  it('joins a report split anywhere, in the shapes Ink delivers (ESC stripped)', () => {
    for (const report of [mouse, reply]) {
      for (let at = 2; at < report.length; at++) {
        const read = createKeyReportReader()
        // Ink flushes the unfinished start with its ESC stripped; the rest is plain text.
        expect(read(report.slice(1, at))).toEqual({ kind: 'partial', continued: false })
        expect(read(`${report.slice(at)}x`)).toEqual({ kind: 'report', joined: true, rest: 'x' })
        expect(read('[')).toEqual({ kind: 'partial', continued: false })
      }
      // Split right after ESC: Ink delivers Escape, then the whole report.
      expect(createKeyReportReader()(report.slice(1))).toEqual({
        kind: 'report',
        joined: false,
        rest: '',
      })
    }
  })

  it('follows a start over several events and keeps ESC-led host input', () => {
    const read = createKeyReportReader()
    expect(read('\u001b[<0')).toEqual({ kind: 'partial', continued: false })
    expect(read(';3')).toEqual({ kind: 'partial', continued: true })
    expect(read(';4M')).toEqual({ kind: 'report', joined: true, rest: '' })
  })

  it('lets ordinary typing through', () => {
    const read = createKeyReportReader()
    expect(read('a')).toEqual({ kind: 'text' })
    // A typed `[` might start a report; what follows decides.
    expect(read('[')).toEqual({ kind: 'partial', continued: false })
    expect(read('a')).toEqual({ kind: 'text' })
    read('[')
    expect(read('[')).toEqual({ kind: 'partial', continued: false })
    expect(read('1')).toEqual({ kind: 'partial', continued: true })
    expect(read(']')).toEqual({ kind: 'text' })
    read('[')
    expect(read('?')).toEqual({ kind: 'partial', continued: true })
    expect(read('a')).toEqual({ kind: 'text' })
    // A key without text (an arrow, Escape) ends a start.
    read('[<0')
    expect(read('')).toEqual({ kind: 'text' })
    expect(read(';3;4M')).toEqual({ kind: 'text' })
    read('[')
    expect(read('\r')).toEqual({ kind: 'text' })
  })

  it('drops a start past its bound as noise', () => {
    const read = createKeyReportReader()
    expect(read(`[${'1'.repeat(64)}`)).toEqual({ kind: 'text' })
    read(`[${'1'.repeat(62)}`)
    expect(read('11')).toEqual({ kind: 'text' })
  })
})
