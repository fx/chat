/**
 * `@fx-/chat-ink` renders with the React and Ink a host hands it; tests hand
 * it the installed ones — both the source (the package's tests) and the
 * built package (the terminal app's tests import it by name).
 */
import * as ink from 'ink'
import * as React from 'react'
import { createChatInk as createBuiltChatInk } from './dist/index.js'
import { createChatInk } from './src/create'

createChatInk({ React, ink })
createBuiltChatInk({ React, ink })
