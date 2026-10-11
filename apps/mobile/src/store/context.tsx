import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react'
import type { AppStore } from './store'
import type { AppState } from './types'

const StoreContext = createContext<AppStore | null>(null)

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

/** Subscribe to the store state (re-renders on every change). */
export function useAppState(): AppState {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
