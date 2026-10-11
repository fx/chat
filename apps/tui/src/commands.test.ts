import { describe, expect, it, vi } from 'vitest'
import { COMMANDS, commandProvider, modelProvider, parseCommand } from './commands'

const signal = new AbortController().signal

describe('commands', () => {
  it('parses command lines', () => {
    expect(parseCommand('/Model gpt-x ')).toEqual({ name: 'model', arg: 'gpt-x' })
    expect(parseCommand('/new')).toEqual({ name: 'new', arg: '' })
    expect(parseCommand('/system be\nbrief')).toEqual({ name: 'system', arg: 'be\nbrief' })
    expect(parseCommand('hello /new')).toBeUndefined()
  })

  it('completes command names at the start of the input', () => {
    expect(commandProvider.match('/mo', 3)).toEqual({ query: 'mo', range: [0, 3] })
    expect(commandProvider.match('/mo x', 3)).toEqual({ query: 'mo', range: [0, 3] })
    expect(commandProvider.match('/mox', 3)).toBeNull()
    expect(commandProvider.match('hi /mo', 6)).toBeNull()
    const items = commandProvider.items('n', signal) as Array<{ id: string; label: string }>
    expect(items.map((i) => i.id)).toEqual(['new'])
    expect((commandProvider.items('', signal) as unknown[]).length).toBe(COMMANDS.length)
    expect(commandProvider.items('model', signal)).toEqual([
      { id: 'model', label: '/model <id>', description: 'switch model' },
    ])
    expect(commandProvider.apply({ id: 'model', label: '/model' }, '', ' rest')).toEqual({
      value: '/model rest',
      caret: 7,
    })
  })

  it('completes model ids, caching the list and retrying after a failure', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(['gpt-a', 'GPT-b', 'other'])
    const provider = modelProvider(list)
    expect(provider.match('/model g', 8)).toEqual({ query: 'g', range: [7, 8] })
    expect(provider.match('/models', 7)).toBeNull()
    await expect(provider.items('g', signal)).rejects.toThrow('down')
    expect(await provider.items('g', signal)).toEqual([
      { id: 'gpt-a', label: 'gpt-a' },
      { id: 'GPT-b', label: 'GPT-b' },
    ])
    await provider.items('', signal)
    expect(list).toHaveBeenCalledTimes(2)
    expect(provider.apply({ id: 'gpt-a', label: 'gpt-a' }, '/model ', '')).toEqual({
      value: '/model gpt-a',
      caret: 12,
    })
  })
})
