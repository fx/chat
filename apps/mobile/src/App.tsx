/**
 * App shell: first-launch setup, then list ⇄ conversation ⇄ settings
 * navigation, with the Android back action mapped onto it.
 */
import { ChatProvider } from '@fx/chat'
import { createShadcnClassNames, createShadcnComponents } from '@fx/chat-shadcn'
import { Calculator, Clock, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Header } from './components/ui'
import { onAssistPrompt, onBackButton } from './platform'
import { Conversation } from './screens/Conversation'
import { ConversationList } from './screens/ConversationList'
import { ProfileEditor } from './screens/ProfileEditor'
import { Settings, type SettingsPath, parentPath } from './screens/Settings'
import { useAppState, useStore } from './store/context'

/** Touch-tuned shadcn registry: longer tooltip delay, 44px disclosure rows. */
const components = createShadcnComponents({
  touch: true,
  tooltipDelay: 300,
  // The built-in tools' activity tiles.
  toolIcons: { fetch_url: Globe, calculator: Calculator, current_time: Clock },
})
const classNames = createShadcnClassNames({ touch: true })

export type Route =
  | { name: 'list' }
  | { name: 'chat'; id: string }
  | { name: 'settings'; path: SettingsPath }

/** Where the back action goes: up the settings menu, else to the list. */
export function parentRoute(route: Route): Route {
  const up = route.name === 'settings' ? parentPath(route.path) : undefined
  return up ? { name: 'settings', path: up } : { name: 'list' }
}

export function App() {
  const state = useAppState()
  const store = useStore()
  const [route, setRoute] = useState<Route>({ name: 'list' })

  // Back goes up a level; on the list the default (exit) applies because no
  // handler is registered.
  const atList = route.name === 'list'
  useEffect(() => {
    if (atList) return
    return onBackButton(() => setRoute(parentRoute))
  }, [atList])

  const newChat = async () => {
    const meta = await store.createConversation()
    setRoute({ name: 'chat', id: meta.id })
  }

  // Invoked as the digital assistant: each spoken prompt starts a new chat.
  const ready = state.loaded && state.settings.profiles.length > 0
  useEffect(() => {
    if (!ready) return
    return onAssistPrompt(async (text) => {
      const meta = await store.createAssistantConversation()
      setRoute({ name: 'chat', id: meta.id })
      await store.send(meta.id, text)
    })
  }, [ready, store])

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
    screen = (
      <Settings
        path={route.path}
        onNavigate={(path) => setRoute({ name: 'settings', path })}
        onBack={() => setRoute({ name: 'list' })}
      />
    )
  } else {
    screen = (
      <ConversationList
        onOpen={(id) => setRoute({ name: 'chat', id })}
        onNew={() => void newChat()}
        onSettings={() => setRoute({ name: 'settings', path: [] })}
      />
    )
  }

  return (
    <ChatProvider components={components} classNames={classNames}>
      {screen}
    </ChatProvider>
  )
}
