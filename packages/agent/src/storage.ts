/**
 * Key-value persistence for the conversation controller. IndexedDB behaves
 * identically in a webview (app-private storage) and a desktop browser, so one
 * implementation serves both; the in-memory store backs terminals and tests.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

const STORE = 'kv'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * An IndexedDB-backed store in database `name`. The database is opened on
 * first use, so creating the store never touches `indexedDB` (it is safe to
 * import where IndexedDB does not exist).
 */
export function indexedDbStore(name = 'fx-chat'): KeyValueStore {
  let db: Promise<IDBDatabase> | undefined
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return db
  }
  const tx = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE)
  return {
    async get<T>(key: string) {
      return (await request((await tx('readonly')).get(key))) as T | undefined
    },
    async set(key, value) {
      await request((await tx('readwrite')).put(value, key))
    },
    async delete(key) {
      await request((await tx('readwrite')).delete(key))
    },
  }
}

/** A volatile in-memory store. Values are cloned in and out, like IndexedDB. */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & {
  data: Map<string, unknown>
} {
  const data = new Map(Object.entries(initial))
  return {
    data,
    async get<T>(key: string) {
      return structuredClone(data.get(key)) as T | undefined
    },
    async set(key, value) {
      data.set(key, structuredClone(value))
    },
    async delete(key) {
      data.delete(key)
    },
  }
}
