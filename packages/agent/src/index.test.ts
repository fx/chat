// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as agent from './index'

describe('@fx-/chat-agent public surface', () => {
  it('exports the runtime entry points', () => {
    expect(Object.keys(agent).sort()).toEqual([
      'AGENT_META_KEY',
      'AgentError',
      'ChatController',
      'FETCH_TEXT_LIMIT',
      'TOOL_INFO',
      'ThinkSplitter',
      'applyEvent',
      'beginStep',
      'buildTools',
      'createClient',
      'createTurn',
      'encodeHistory',
      'endStep',
      'evaluateArithmetic',
      'finalizeTurn',
      'flattenToolHistory',
      'indexedDbStore',
      'memoryStore',
      'newId',
      'parseSSE',
      'readAgentMeta',
      'runAgent',
      'splitSteps',
      'stripHtml',
      'titleFrom',
      'toolResultContent',
      'updateToolCall',
    ])
  })
})
