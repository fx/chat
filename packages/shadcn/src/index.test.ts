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
        'createActivityTiles',
        'Drawer',
        'DrawerClose',
        'DrawerContent',
        'DrawerDescription',
        'DrawerHeader',
        'DrawerOverlay',
        'DrawerPortal',
        'DrawerTitle',
        'MessageDetailsSheet',
        'createShadcnClassNames',
        'createShadcnComponents',
        'lucideIcons',
        'shadcnClassNames',
        'shadcnComponents',
        'tileText',
      ].sort(),
    )
  })

  it('sizes every disclosure row alike, larger for touch', () => {
    const touch = root.createShadcnClassNames({ touch: true })
    expect(root.shadcnClassNames.rowHeader).toContain('min-h-7')
    expect(root.shadcnClassNames.rowHeader).toContain('text-xs')
    expect(touch.rowHeader).toContain('min-h-10')
    expect(touch.rowHeader).toContain('text-sm')
    expect(touch.row).toContain('text-sm')
    expect(touch.rowTimer).toContain('text-[0.8125rem]')
    expect(root.shadcnClassNames.rowTimer).toContain('text-xs')
    // A static row's header reserves the caret's width.
    expect(touch.row).toContain('[&>.chat-row-header]:pl-5')
    expect(touch.footer).toContain('text-xs')
    expect(touch.footerMetrics).toContain('basis-full')
    expect(root.shadcnClassNames.footer).toContain('text-[0.625rem]')
    expect(root.shadcnClassNames.footerMetrics).not.toContain('basis-full')
    expect(touch.footerFact).toContain('size-11')
    expect(root.shadcnClassNames.footerFact).not.toContain('size-11')
    expect(touch.footerFactIcon).toBe('size-4')
    expect(root.shadcnClassNames.footerFactIcon).toBe('size-3')
    expect(touch.footerActivity).toContain('px-0')
    expect(touch.rowIcon).toContain('[.chat-row-affordance+&]:hidden')
    for (const key of ['toolBody', 'reasoningBody', 'systemBody', 'plan'] as const)
      expect(touch[key]).toContain('pl-5')
  })

  it('styles every message container hook', () => {
    for (const key of ['log', 'message', 'text', 'footer', 'input'] as const)
      expect(root.shadcnClassNames[key]).toBeTruthy()
  })
})
