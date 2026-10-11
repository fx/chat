/**
 * First-run and `/setup` endpoint configuration through tx's dialogs:
 * base URL, optional API key, then a model picked from the endpoint's list (or
 * typed when listing fails).
 */
import { type FetchLike, createClient } from '@fx/chat-agent'
import type { Dialogs } from '@fx/tx/dialogs'
import type { ChatSettings } from './settings'

const TYPE_MODEL = Symbol('type-model')

export async function runSetup(
  dialogs: Dialogs,
  fetch: FetchLike,
  current: Partial<ChatSettings>,
): Promise<ChatSettings | undefined> {
  const baseUrl = (
    await dialogs.input({
      message: 'OpenAI-compatible base URL (e.g. https://api.example.com/v1)',
      initialValue: current.baseUrl ?? '',
    })
  )?.trim()
  if (!baseUrl) return undefined
  const apiKey = await dialogs.input({
    message: 'API key (leave empty for local servers)',
    initialValue: current.apiKey ?? '',
  })
  if (apiKey === undefined) return undefined

  let models: string[] = []
  let failure = ''
  try {
    models = await createClient({ baseUrl, apiKey: apiKey || undefined, fetch }).listModels()
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
    ...(apiKey ? { apiKey } : { apiKey: '' }),
    model,
  }
}
