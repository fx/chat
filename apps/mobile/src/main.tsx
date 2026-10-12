import '@fx-/chat/structure.css'
import './index.css'
import { indexedDbStore, memoryStore } from '@fx-/chat-agent'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { appFetch, domHtmlToText, trackVisualViewport } from './platform'
import { StoreProvider } from './store/context'
import { AppStore } from './store/store'

const root = document.getElementById('root') as HTMLElement
root.classList.add('app-shell')
trackVisualViewport(root)

const kv = typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore()
const store = new AppStore({ kv, fetch: appFetch, htmlToText: domHtmlToText })
void store.load()

createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
)
