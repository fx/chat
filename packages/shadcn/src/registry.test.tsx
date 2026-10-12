import { HEADLESS_ICON_NAMES } from '@fx-/chat/headless'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlock, JsonView } from './code'
import { lucideIcons } from './icons'
import { createShadcnComponents, shadcnComponents } from './registry'
import { Badge } from './ui/badge'
import {
  TooltipContent,
  TooltipProvider,
  Tooltip as TooltipRoot,
  TooltipTrigger,
} from './ui/tooltip'

const {
  Button,
  Badge: BadgeSlot,
  Tooltip,
  Collapsible,
  ScrollArea,
  Avatar,
  CopyButton,
} = shadcnComponents

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shadcn registry slots', () => {
  it('renders an icon button with a 44px target', () => {
    const onClick = vi.fn()
    render(
      <Button aria-label="Retry" className="extra" onClick={onClick}>
        x
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Retry' })
    expect(button).toHaveClass('min-h-11', 'min-w-11', 'extra')
    // Not a fixed 28px square: a labelled button grows to fit its label.
    expect(button).toHaveClass('w-auto')
    expect(button).not.toHaveClass('w-7')
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('maps badge tones onto variants', () => {
    const { container } = render(
      <>
        <BadgeSlot tone="error">e</BadgeSlot>
        <BadgeSlot tone="success">s</BadgeSlot>
        <BadgeSlot>d</BadgeSlot>
      </>,
    )
    const [error, success, plain] = container.querySelectorAll('span')
    expect(error).toHaveClass('bg-destructive')
    expect(success).toHaveClass('bg-emerald-500/15')
    expect(plain).toHaveClass('bg-secondary')
  })

  it('wraps tooltip triggers in a span carrying the class', () => {
    render(
      <Tooltip content="tip" className="trigger">
        hover me
      </Tooltip>,
    )
    expect(screen.getByText('hover me')).toHaveClass('trigger')
  })

  it('draws tooltip content when open', () => {
    render(
      <TooltipProvider>
        <TooltipRoot open>
          <TooltipTrigger>t</TooltipTrigger>
          <TooltipContent className="tip">content</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>,
    )
    expect(screen.getAllByText('content')[0]).toBeInTheDocument()
  })

  it('toggles an uncontrolled collapsible', () => {
    const onOpenChange = vi.fn()
    render(
      <Collapsible header="Details" onOpenChange={onOpenChange}>
        body
      </Collapsible>,
    )
    expect(screen.queryByText('body')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('follows a controlled collapsible and only reports changes', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <Collapsible header="Details" open={false} onOpenChange={onOpenChange}>
        body
      </Collapsible>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByText('body')).toBeNull()
    rerender(
      <Collapsible header="Details" open>
        body
      </Collapsible>,
    )
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('renders the scroll area and avatar', () => {
    const { container } = render(
      <>
        <ScrollArea className="scroll">content</ScrollArea>
        {/* biome-ignore lint/a11y/useValidAriaRole: `role` is the chat role prop, not ARIA */}
        <Avatar role="assistant" className="avatar" />
      </>,
    )
    expect(container.querySelector('.scroll')).toHaveTextContent('content')
    const avatar = screen.getByLabelText('assistant')
    expect(avatar).toHaveClass('avatar')
    expect(avatar).toHaveTextContent('A')
  })

  it('maps every library icon name', () => {
    for (const name of HEADLESS_ICON_NAMES) expect(lucideIcons[name]).toBeTypeOf('function')
    const Icon = lucideIcons.check
    const { container } = render(
      <>
        <Icon />
        <Icon size={20} className="i" />
      </>,
    )
    const [plain, sized] = container.querySelectorAll('svg')
    expect(plain).toHaveAttribute('width', '16')
    expect(sized).toHaveAttribute('width', '20')
  })
})

describe('copy button', () => {
  it('copies, shows the check, then resets', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CopyButton value="hello" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await act(async () => fireEvent.click(button))
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(button).toHaveAttribute('data-copied', 'true')
    act(() => vi.advanceTimersByTime(1500))
    expect(button).not.toHaveAttribute('data-copied')
  })

  it('still confirms without a clipboard and can keep the check', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    const { CopyButton: Sticky } = createShadcnComponents({ copyResetMs: 0 })
    render(<Sticky value="v" aria-label="Copy it" className="c" />)
    const button = screen.getByRole('button', { name: 'Copy it' })
    expect(button).toHaveClass('c')
    fireEvent.click(button)
    act(() => vi.advanceTimersByTime(5000))
    expect(button).toHaveAttribute('data-copied', 'true')
  })

  it('restarts the reset on a second copy and clears it on unmount', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    const { unmount } = render(<CopyButton value="v" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    fireEvent.click(button)
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(button)
    act(() => vi.advanceTimersByTime(1000))
    // The first click's reset no longer fires; only the second's is pending.
    expect(button).toHaveAttribute('data-copied', 'true')
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('confirms when there is no navigator at all', () => {
    vi.stubGlobal('navigator', undefined)
    render(<CopyButton value="v" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('data-copied', 'true')
  })
})

describe('options', () => {
  it('tunes disclosure rows for touch', () => {
    const { Collapsible: Touch } = createShadcnComponents({ touch: true, tooltipDelay: 300 })
    render(<Touch header="Row" />)
    const trigger = screen.getByRole('button', { name: 'Row' })
    // Row height comes from the classNames theme's row header, not the trigger.
    expect(trigger).not.toHaveClass('min-h-11')
    expect(trigger).not.toHaveClass('hover:text-foreground/80')
  })

  it('keeps the hover tint for pointer devices', () => {
    render(<Collapsible header="Row" />)
    expect(screen.getByRole('button', { name: 'Row' })).toHaveClass('hover:text-foreground/80')
  })
})

describe('code views', () => {
  it('tags the language when given', () => {
    const { container } = render(
      <>
        <CodeBlock code="x" language="ts" className="k" />
        <CodeBlock code="y" />
      </>,
    )
    const [tagged, plain] = container.querySelectorAll('pre')
    expect(tagged).toHaveAttribute('data-language', 'ts')
    expect(tagged).toHaveClass('k')
    expect(plain).not.toHaveAttribute('data-language')
  })

  it('pretty-prints JSON and falls back to String', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const { container } = render(
      <>
        <JsonView value={{ a: 1 }} className="j" />
        <JsonView value={undefined} />
        <JsonView value={circular} />
      </>,
    )
    const [obj, undef, circ] = container.querySelectorAll('pre')
    expect(obj).toHaveTextContent('"a": 1')
    expect(obj).toHaveClass('j')
    expect(undef).toHaveTextContent('undefined')
    expect(circ).toHaveTextContent('[object Object]')
  })
})

describe('primitives', () => {
  it('Badge applies its default variant', () => {
    render(<Badge>b</Badge>)
    expect(screen.getByText('b')).toHaveClass('bg-secondary')
  })
})
