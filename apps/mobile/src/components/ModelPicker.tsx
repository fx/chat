/**
 * Pick an endpoint and one of its models (listed, or typed by hand). Shared
 * by a conversation's model sheet and the assistant settings.
 */
import { useEffect, useState } from 'react'
import { useAppState, useStore } from '../store/context'
import type { Profile } from '../store/types'
import { PrimaryButton, SecondaryButton } from './ui'

export interface ModelChoice {
  profileId: string
  model: string
}

export function ModelPicker({
  profile,
  model,
  active = true,
  onChoose,
}: {
  /** The chosen endpoint; models are only ever listed from it. */
  profile: Profile | undefined
  model: string | undefined
  /** List models only while shown (a closed sheet stays quiet). */
  active?: boolean
  onChoose: (choice: ModelChoice) => void
}) {
  const { settings } = useAppState()
  const store = useStore()
  const [models, setModels] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!active || !profile) return
    const controller = new AbortController()
    setError(undefined)
    // Never offer the previous profile's models under the new one.
    setModels(undefined)
    store
      .listModels(profile, controller.signal)
      .then(setModels)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => controller.abort()
  }, [active, profile, store])

  return (
    <div className="flex flex-col gap-3">
      {settings.profiles.length > 1 || !profile ? (
        <div className="flex flex-wrap gap-2">
          {settings.profiles.map((p) => (
            <SecondaryButton
              key={p.id}
              aria-pressed={p.id === profile?.id}
              className="aria-pressed:border-primary aria-pressed:text-primary"
              onClick={() => onChoose({ profileId: p.id, model: p.model })}
            >
              {p.name}
            </SecondaryButton>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!profile ? <p className="text-sm text-muted-foreground">Choose an endpoint.</p> : null}
      {profile && models === undefined && !error ? (
        <p className="text-sm text-muted-foreground">Loading models…</p>
      ) : null}
      <ul className="flex max-h-72 flex-col overflow-y-auto">
        {(profile ? (models ?? []) : []).map((m) => (
          <li key={m}>
            <button
              type="button"
              aria-pressed={m === model}
              onClick={() => profile && onChoose({ profileId: profile.id, model: m })}
              className="min-h-11 w-full truncate rounded-md px-3 text-left text-sm aria-pressed:bg-muted aria-pressed:font-medium"
            >
              {m}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (profile && typed.trim()) onChoose({ profileId: profile.id, model: typed.trim() })
        }}
      >
        <input
          aria-label="Model id"
          placeholder="Type a model id"
          autoCapitalize="off"
          autoCorrect="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base"
        />
        <PrimaryButton type="submit">Use</PrimaryButton>
      </form>
    </div>
  )
}
