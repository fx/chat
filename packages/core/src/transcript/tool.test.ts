import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '../model'
import { summarizeBlock } from './blockSummary'
import { summarizeToolInput, toolDisplayInput, toolLabel, toolResultText } from './tool'

const call = (extra: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: 'tool_call',
  id: 't',
  name: 'fs_read',
  arguments: {},
  status: 'success',
  ...extra,
})

describe('tool helpers', () => {
  it('labels with a non-blank title, else the name, in rows and summaries', () => {
    expect(toolLabel(call({ title: ' Read config.yaml ' }))).toBe('Read config.yaml')
    expect(toolLabel(call({ title: '  ' }))).toBe('fs_read')
    expect(summarizeBlock(call({ title: 'Read config.yaml' })).label).toBe('Read config.yaml')
  })

  it('summarizes inputs', () => {
    expect(summarizeToolInput('  ls   -la ')).toBe('ls -la')
    expect(summarizeToolInput('   ')).toBeUndefined()
    expect(summarizeToolInput({ path: ' ', file_path: 'a.ts', command: '' })).toBe('a.ts')
    expect(summarizeToolInput({ n: 1, s: 'x' })).toBe('{"n":1,"s":"x"}')
    expect(summarizeToolInput({})).toBeUndefined()
    expect(summarizeToolInput([])).toBeUndefined()
    expect(summarizeToolInput([1, 2])).toBe('[1,2]')
    expect(summarizeToolInput(null)).toBeUndefined()
    expect(summarizeToolInput(5)).toBeUndefined()
    expect(summarizeToolInput('abcdef', 4)).toBe('abc…')
  })

  it('shows input only when it adds something', () => {
    expect(
      toolDisplayInput(call({ title: 'Run npm test', arguments: { command: 'npm test' } })),
    ).toBeUndefined()
    expect(toolDisplayInput(call({ arguments: { command: 'npm test' } }))).toBe('npm test')
    expect(
      toolDisplayInput(call({ inputSummary: ' src/ a.ts ', arguments: { command: 'x' } })),
    ).toBe('src/ a.ts')
    expect(toolDisplayInput(call({ inputSummary: '  ', arguments: {} }))).toBeUndefined()
  })

  it('cuts a host input summary to one line like a derived one', () => {
    const long = `run\n${'x'.repeat(400)}`
    const shown = toolDisplayInput(call({ inputSummary: long }))
    expect(shown).toHaveLength(300)
    expect(shown?.startsWith('run x')).toBe(true)
    expect(shown?.endsWith('…')).toBe(true)
    expect(toolDisplayInput(call({ inputSummary: 'a\n b c' }), 4)).toBe('a b…')
    expect(toolDisplayInput(call({ arguments: { command: 'abcdef' } }), 4)).toBe('abc…')
  })

  it('formats tool output text', () => {
    expect(toolResultText('plain')).toBe('plain')
    expect(toolResultText(undefined)).toBe('')
    expect(toolResultText({ ok: true })).toBe('{\n  "ok": true\n}')
    expect(toolResultText(() => 1)).toBe('null')
  })
})
