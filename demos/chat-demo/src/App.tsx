/**
 * Demo application shell.
 *
 * A compact, functional controls strip over one or more {@link Pane}s. The same
 * fixture conversation renders through the selected registry (single-pane) or
 * through all three at once (compare layout) — proving the library is
 * design-system agnostic: only the injected registry changes between panes.
 *
 * All data is local fixtures; there is no backend and no runtime network call.
 */
import './index.css'
import { useMemo, useState } from 'react'
import { Pane } from './Pane'
import { FIXTURES, type FixtureId, resolvedConversation } from './fixtures/conversation'
import { useStreamingDriver } from './fixtures/useStreamingDriver'
import { REGISTRIES, REGISTRY_IDS, type RegistryId } from './registries'

type Layout = 'single' | 'compare'
type Theme = 'light' | 'dark'

/** A labelled `<select>` control. */
function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className="demo-control">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A labelled pressable toggle control. */
function ToggleControl({
  label,
  pressed,
  onToggle,
}: {
  label: string
  pressed: boolean
  onToggle: () => void
}) {
  return (
    <span className="demo-control" data-toggle={pressed ? 'on' : 'off'}>
      <button type="button" aria-pressed={pressed} onClick={onToggle}>
        {label}
      </button>
    </span>
  )
}

/** The demo root. */
export function App() {
  const [registryId, setRegistryId] = useState<RegistryId>('fx-ui')
  const [layout, setLayout] = useState<Layout>('single')
  const [theme, setTheme] = useState<Theme>('light')
  const [fixtureId, setFixtureId] = useState<FixtureId>('resolved')
  const [flat, setFlat] = useState(false)
  const [verbose, setVerbose] = useState(false)

  const isStreamingFixture = fixtureId === 'streaming'
  const stream = useStreamingDriver(isStreamingFixture)

  const view = useMemo(() => {
    if (isStreamingFixture) {
      return {
        messages: stream.messages,
        isStreaming: stream.isStreaming,
        streamingMessageId: stream.streamingMessageId as string | undefined,
      }
    }
    return {
      messages: resolvedConversation,
      isStreaming: false,
      streamingMessageId: undefined,
    }
  }, [isStreamingFixture, stream.messages, stream.isStreaming, stream.streamingMessageId])

  const activeRegistries = layout === 'compare' ? REGISTRY_IDS : ([registryId] as RegistryId[])

  return (
    <main className="demo-shell">
      <div className="demo-controls" role="toolbar" aria-label="Demo controls">
        <SelectControl
          label="Registry"
          value={registryId}
          onChange={setRegistryId}
          options={REGISTRY_IDS.map((id) => ({ value: id, label: REGISTRIES[id].label }))}
        />
        <SelectControl
          label="Fixture"
          value={fixtureId}
          onChange={setFixtureId}
          options={(Object.keys(FIXTURES) as FixtureId[]).map((id) => ({
            value: id,
            label: FIXTURES[id].label,
          }))}
        />
        <SelectControl
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'single', label: 'Single' },
            { value: 'compare', label: 'Compare' },
          ]}
        />
        <SelectControl
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <ToggleControl label="Flat" pressed={flat} onToggle={() => setFlat((v) => !v)} />
        <ToggleControl label="Verbose" pressed={verbose} onToggle={() => setVerbose((v) => !v)} />
        {isStreamingFixture ? (
          <ToggleControl label="Replay" pressed={false} onToggle={stream.replay} />
        ) : null}
      </div>

      <div className="demo-panes" data-layout={layout}>
        {activeRegistries.map((id) => (
          <Pane
            key={id}
            registry={REGISTRIES[id]}
            messages={view.messages}
            isStreaming={view.isStreaming}
            {...(view.streamingMessageId ? { streamingMessageId: view.streamingMessageId } : {})}
            flat={flat}
            verbose={verbose}
            theme={theme}
            showHeader={layout === 'compare'}
          />
        ))}
      </div>
    </main>
  )
}
