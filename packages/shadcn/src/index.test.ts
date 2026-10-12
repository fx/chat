/**
 * Pins `@fx/chat-shadcn`'s public surface: every name here is part of the
 * published API, so removing one is a breaking change. Extend it deliberately.
 */
import { describe, expect, it } from 'vitest'
import * as root from './index'

describe('public export surface', () => {
  it('exports the registry, theme and primitives', () => {
    expect(Object.keys(root).sort()).toEqual(
      [
        'Avatar',
        'AvatarFallback',
        'Badge',
        'Button',
        'CodeBlock',
        'Collapsible',
        'CollapsibleContent',
        'CollapsibleTrigger',
        'JsonView',
        'MarkdownView',
        'ScrollArea',
        'Tooltip',
        'TooltipContent',
        'TooltipProvider',
        'TooltipTrigger',
        'badgeVariants',
        'buttonVariants',
        'cn',
        'createShadcnComponents',
        'lucideIcons',
        'shadcnClassNames',
        'shadcnComponents',
      ].sort(),
    )
  })

  it('styles every message container hook', () => {
    for (const key of ['log', 'message', 'text', 'footer', 'input'] as const)
      expect(root.shadcnClassNames[key]).toBeTruthy()
  })
})
