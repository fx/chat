/**
 * First-run and `/setup` endpoint configuration through tx's dialogs:
 * base URL, optional API key, then a model picked from the endpoint's list (or
 * typed when listing fails).
 *
 * A key provided by a flag or the environment is never pre-filled or
 * returned: the result is what may be stored, so it holds only a key the user
 * typed (or a stored key they kept).
 */
import { type FetchLike, createClient } from '@fx/chat-agent'
import type { Dialogs } from '@fx/tx/dialogs'
import type { ChatSettings } from './settings'

/** An API key that came from a flag or the environment, never stored. */
export interface ProvidedKey {
  apiKey: string
  source: 'flag' | 'env'
}

const TYPE_MODEL = Symbol('type-model')

export async function runSetup(
  dialogs: Dialogs,
  fetch: FetchLike,
  resolved: Partial<ChatSettings>,
  provided?: ProvidedKey,
): Promise<ChatSettings | undefined> {
  const { apiKey: resolvedKey, ...current } = resolved
  const baseUrl = (
    await dialogs.input({
      message: 'OpenAI-compatible base URL (e.g. https://api.example.com/v1)',
      initialValue: current.baseUrl ?? '',
    })
  )?.trim()
  if (!baseUrl) return undefined
  const apiKey = await dialogs.input({
    message: provided
      ? `API key (leave empty to use the one from ${provided.source === 'flag' ? '--api-key' : 'OPENAI_API_KEY'}, which is not saved)`
      : 'API key (leave empty for local servers)',
    initialValue: provided ? '' : (resolvedKey ?? ''),
  })
  if (apiKey === undefined) return undefined
  const sessionKey = apiKey || provided?.apiKey

  let models: string[] = []
  let failure = ''
  try {
    models = await createClient({ baseUrl, apiKey: sessionKey || undefined, fetch }).listModels()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  const choice = await dialogs.select<string | typeof TYPE_MODEL>({
    message: failure ? `Model (listing failed: ${failure})` : 'Model',
    filter: 'always',
    options: [
      ...models.map((id) => ({ label: id, value: id })),
      {
        label: 'Type a model id…',
        value: TYPE_MODEL,
        fields: [
          {
            type: 'text' as const,
            name: 'model',
            message: 'Model id',
            initialValue: current.model ?? '',
          },
        ],
      },
    ],
  })
  if (!choice) return undefined
  const model = choice.value === TYPE_MODEL ? choice.values.model?.trim() : choice.value
  if (!model) return undefined
  return {
    ...current,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    // Empty with a provided key: say nothing, so a stored key stays as is.
    ...(apiKey ? { apiKey } : provided ? {} : { apiKey: '' }),
    model,
  }
}
