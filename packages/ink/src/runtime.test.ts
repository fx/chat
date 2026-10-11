// @vitest-environment node
import * as ink from 'ink'
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { createChatInk } from './create'
import { bindRuntime, isBound, unbound } from './runtime'

describe('runtime binding', () => {
  it('is bound by createChatInk, again with the same instances, never with others', () => {
    expect(isBound()).toBe(true)
    const chat = createChatInk({ React, ink })
    expect(chat.React).toBe(React)
    expect(chat.ClockProvider).toBeTypeOf('function')
    expect(() => bindRuntime({ React: { ...React }, ink })).toThrow(/already bound/)
    expect(() => bindRuntime({ React, ink: { ...ink } })).toThrow(/already bound/)
  })

  it('names the missing call when used unbound', () => {
    const missing = unbound<{ useState: unknown }>()
    expect(() => missing.useState).toThrow(/call createChatInk\(\{ React, ink \}\) first/)
  })
})
