import { newId } from '@fx/chat-agent'
import { cn } from '@fx/chat-shadcn'
/**
 * Create or edit an endpoint profile: base URL, API key (masked), name, and
 * whether it is enabled, with a connection test that lists its models.
 * Models are chosen in the model picker, from every endpoint at once.
 */
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Field,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toggle,
} from '../components/ui'
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
  const [enabled, setEnabled] = useState(!profile?.disabled)
  const [tested, setTested] = useState<{ ok: boolean; text: string }>()
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const urlError = validateBaseUrl(baseUrl)

  /** List the endpoint's models: proof the URL and key work. */
  const testConnection = async () => {
    if (urlError) {
      setTouched(true)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setTested(undefined)
    try {
      const list = await store.listModels({ baseUrl: baseUrl.trim(), apiKey }, controller.signal)
      setTested({
        ok: true,
        text:
          list.length > 0
            ? `Connected: ${list.length} models available.`
            : 'Connected, but it lists no models; you can still type a model id when choosing one.',
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        setTested({ ok: false, text: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }

  const save = () => {
    setTouched(true)
    if (urlError) return
    const url = new URL(baseUrl.trim())
    onSaved({
      id: profile?.id ?? newId('p'),
      name: name.trim() || url.host,
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      ...(enabled ? {} : { disabled: true }),
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

      <div className="flex flex-col gap-1.5">
        <SecondaryButton onClick={testConnection} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
          Test connection
        </SecondaryButton>
        {tested ? (
          <p
            role={tested.ok ? 'status' : 'alert'}
            className={cn('text-xs', tested.ok ? 'text-muted-foreground' : 'text-destructive')}
          >
            {tested.text}
          </p>
        ) : null}
      </div>

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

      {profile ? (
        <Toggle
          label="Enabled"
          description="Disabled endpoints are left out of the model list and never used for new chats; chats already on it keep working."
          checked={enabled}
          onChange={setEnabled}
        />
      ) : null}

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
