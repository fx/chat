import { newId } from '@fx/chat-agent'
/**
 * Create or edit an endpoint profile: name, base URL, API key (masked), and
 * default model picked from the endpoint's model list or typed by hand.
 */
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Field, IconButton, PrimaryButton, SecondaryButton, TextInput } from '../components/ui'
import { useStore } from '../store/context'
import type { Profile } from '../store/types'

export function validateBaseUrl(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'Required'
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Use an http(s) URL'
  } catch {
    return 'Not a valid URL'
  }
  return undefined
}

export function ProfileEditor({
  profile,
  onSaved,
  onCancel,
  onDelete,
}: {
  profile?: Profile | undefined
  onSaved: (profile: Profile) => void
  onCancel?: (() => void) | undefined
  onDelete?: (() => void) | undefined
}) {
  const store = useStore()
  const [name, setName] = useState(profile?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(profile?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState(profile?.model ?? '')
  const [models, setModels] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const listId = useId()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const urlError = validateBaseUrl(baseUrl)

  const loadModels = async () => {
    if (urlError) {
      setTouched(true)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setModelsError(undefined)
    try {
      const list = await store.listModels({ baseUrl: baseUrl.trim(), apiKey }, controller.signal)
      setModels(list)
      if (list.length === 0)
        setModelsError('The endpoint listed no models. Type a model id instead.')
      else if (!model) setModel(list[0] as string)
    } catch (error) {
      if (!controller.signal.aborted) {
        setModelsError(
          `${error instanceof Error ? error.message : String(error)} — type a model id instead.`,
        )
      }
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }

  const save = () => {
    setTouched(true)
    if (urlError || !model.trim()) return
    const url = new URL(baseUrl.trim())
    onSaved({
      id: profile?.id ?? newId('p'),
      name: name.trim() || url.host,
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      model: model.trim(),
    })
  }

  return (
    <form
      className="flex flex-col gap-4 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field
        label="Base URL"
        hint="OpenAI-compatible, usually ending in /v1."
        error={touched ? urlError : undefined}
      >
        {(id) => (
          <TextInput
            id={id}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        )}
      </Field>

      <Field label="API key" hint="Stored only on this device. Leave empty for local servers.">
        {(id) => (
          <div className="flex items-center gap-1">
            <TextInput
              id={id}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="sk-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <IconButton
              label={showKey ? 'Hide key' : 'Show key'}
              onClick={() => setShowKey((s) => !s)}
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        )}
      </Field>

      <Field
        label="Model"
        error={touched && !model.trim() ? 'Required' : modelsError}
        hint={
          models.length > 0 ? `${models.length} models available` : 'Load the list or type an id.'
        }
      >
        {(id) => (
          <div className="flex items-center gap-1">
            <TextInput
              id={id}
              list={listId}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="model id"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <datalist id={listId}>
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <IconButton label="Load models" onClick={loadModels} disabled={loading}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : undefined} />
            </IconButton>
          </div>
        )}
      </Field>

      {models.length > 0 ? (
        <div className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border">
          {models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              aria-pressed={m === model}
              className="min-h-11 truncate px-3 text-left text-sm aria-pressed:bg-muted aria-pressed:font-medium"
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}

      <Field label="Name" hint="Optional; defaults to the host name.">
        {(id) => (
          <TextInput
            id={id}
            placeholder="My endpoint"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <div className="flex flex-wrap gap-2 pt-2">
        <PrimaryButton type="submit" className="flex-1">
          Save
        </PrimaryButton>
        {onCancel ? (
          <SecondaryButton onClick={onCancel} className="flex-1">
            Cancel
          </SecondaryButton>
        ) : null}
      </div>
      {onDelete ? (
        confirmDelete ? (
          <div className="flex gap-2">
            <SecondaryButton className="flex-1 text-destructive" onClick={onDelete}>
              Delete endpoint
            </SecondaryButton>
            <SecondaryButton className="flex-1" onClick={() => setConfirmDelete(false)}>
              Keep
            </SecondaryButton>
          </div>
        ) : (
          <SecondaryButton className="text-destructive" onClick={() => setConfirmDelete(true)}>
            Delete…
          </SecondaryButton>
        )
      ) : null}
    </form>
  )
}
