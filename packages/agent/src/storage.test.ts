import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { indexedDbStore, memoryStore } from './storage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('memoryStore', () => {
  it('clones values in and out', async () => {
    const kv = memoryStore({ a: { n: 1 } })
    const value = await kv.get<{ n: number }>('a')
    expect(value).toEqual({ n: 1 })
    ;(value as { n: number }).n = 2
    expect(await kv.get('a')).toEqual({ n: 1 })
    const stored = { n: 3 }
    await kv.set('b', stored)
    stored.n = 4
    expect(kv.data.get('b')).toEqual({ n: 3 })
    await kv.delete('a')
    expect(await kv.get('a')).toBeUndefined()
    expect(memoryStore().data.size).toBe(0)
  })
})

describe('indexedDbStore', () => {
  it('does not touch IndexedDB until first use', () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(() => indexedDbStore()).not.toThrow()
  })

  it('round-trips values through one lazily opened database', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    const open = vi.spyOn(factory, 'open')
    const kv = indexedDbStore('test')
    expect(await kv.get('missing')).toBeUndefined()
    await kv.set('a', { n: 1 })
    expect(await kv.get('a')).toEqual({ n: 1 })
    await kv.delete('a')
    expect(await kv.get('a')).toBeUndefined()
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('test', 1)
    await indexedDbStore().set('x', 1)
    expect(open).toHaveBeenLastCalledWith('fx-chat', 1)
  })

  it('rejects when the database cannot be opened', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    // A newer version on disk makes opening version 1 fail.
    await new Promise((resolve) => {
      const req = factory.open('newer', 2)
      req.onsuccess = () => resolve(req.result.close())
    })
    await expect(indexedDbStore('newer').get('a')).rejects.toBeDefined()
  })

  it('rejects when a request fails', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const error = new Error('failed')
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      const req = { error } as unknown as IDBRequest
      queueMicrotask(() => req.onerror?.(new Event('error')))
      return req
    })
    await expect(indexedDbStore().get('a')).rejects.toBe(error)
  })
})
