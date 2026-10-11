/**
 * App shell: first-launch setup, then list ⇄ conversation ⇄ settings
 * navigation, with the Android back action mapped onto it.
 */
import { ChatProvider } from '@fx/chat'
import { useEffect, useState } from 'react'
import { appClassNames } from './chat/class-names'
import { appRegistry } from './chat/registry'
import { Header } from './components/ui'
import { onBackButton } from './platform'
import { Conversation } from './screens/Conversation'
import { ConversationList } from './screens/ConversationList'
import { ProfileEditor } from './screens/ProfileEditor'
import { Settings } from './screens/Settings'
import { useAppState, useStore } from './store/context'

export type Route = { name: 'list' } | { name: 'chat'; id: string } | { name: 'settings' }

export function App() {
  const state = useAppState()
  const store = useStore()
  const [route, setRoute] = useState<Route>({ name: 'list' })

  // Back goes to the list from anywhere else; on the list the default (exit)
  // applies because no handler is registered.
  useEffect(() => {
    if (route.name === 'list') return
    return onBackButton(() => setRoute({ name: 'list' }))
  }, [route.name])

  const newChat = async () => {
    const meta = await store.createConversation()
    setRoute({ name: 'chat', id: meta.id })
  }

  let screen: React.ReactNode
  if (!state.loaded) {
    screen = (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  } else if (state.settings.profiles.length === 0) {
    screen = (
      <div className="flex h-full flex-col">
        <Header title="Connect a model" />
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            Point the app at any OpenAI-compatible endpoint — a hosted API or a server on your
            network.
          </p>
          <ProfileEditor
            onSaved={async (profile) => {
              await store.saveProfile(profile)
              await newChat()
            }}
          />
        </div>
      </div>
    )
  } else if (route.name === 'chat') {
    screen = <Conversation key={route.id} id={route.id} onBack={() => setRoute({ name: 'list' })} />
  } else if (route.name === 'settings') {
    screen = <Settings onBack={() => setRoute({ name: 'list' })} />
  } else {
    screen = (
      <ConversationList
        onOpen={(id) => setRoute({ name: 'chat', id })}
        onNew={() => void newChat()}
        onSettings={() => setRoute({ name: 'settings' })}
      />
    )
  }

  return (
    <ChatProvider components={appRegistry} classNames={appClassNames}>
      {screen}
    </ChatProvider>
  )
}
