import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Avatar,
  Badge,
  Button,
  CodeBlock,
  Collapsible,
  CopyButton,
  JsonView,
  ScrollArea,
  Tooltip,
} from './primitives'

describe('Button', () => {
  it('renders children, forwards className and aria-label, and calls onClick', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} className="x" aria-label="Go">
        Hi
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn).toHaveClass('chat-button', 'x')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('honors disabled', () => {
    render(<Button disabled>Hi</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('Badge', () => {
  it('defaults to the default tone', () => {
    render(<Badge>n</Badge>)
    expect(screen.getByText('n')).toHaveAttribute('data-tone', 'default')
  })

  it('applies an explicit tone and className', () => {
    render(
      <Badge tone="error" className="c">
        e
      </Badge>,
    )
    const el = screen.getByText('e')
    expect(el).toHaveAttribute('data-tone', 'error')
    expect(el).toHaveClass('chat-badge', 'c')
  })
})

describe('Tooltip', () => {
  it('uses string content as a title attribute', () => {
    render(
      <Tooltip content="tip">
        <span>trigger</span>
      </Tooltip>,
    )
    expect(screen.getByText('trigger').closest('.chat-tooltip')).toHaveAttribute('title', 'tip')
  })

  it('omits title for non-string content but still renders the trigger', () => {
    render(
      <Tooltip content={<b>rich</b>} className="t">
        <span>trig</span>
      </Tooltip>,
    )
    const wrap = screen.getByText('trig').closest('.chat-tooltip')
    expect(wrap).not.toHaveAttribute('title')
    expect(wrap).toHaveClass('t')
  })
})

describe('Collapsible', () => {
  it('uncontrolled: respects defaultOpen and toggles internal state', () => {
    const onOpenChange = vi.fn()
    render(
      <Collapsible defaultOpen header={<span>Head</span>} onOpenChange={onOpenChange}>
        <p>Body</p>
      </Collapsible>,
    )
    const details = screen.getByText('Head').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(true)
    // Simulate the native toggle to closed.
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('uncontrolled without defaultOpen starts closed', () => {
    render(
      <Collapsible header={<span>H</span>}>
        <p>B</p>
      </Collapsible>,
    )
    const details = screen.getByText('H').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
  })

  it('controlled: open prop drives state and onOpenChange fires on toggle', () => {
    const onOpenChange = vi.fn()
    render(
      <Collapsible open={false} header={<span>Ctl</span>} onOpenChange={onOpenChange} className="k">
        <p>B</p>
      </Collapsible>,
    )
    const details = screen.getByText('Ctl').closest('details') as HTMLDetailsElement
    expect(details).toHaveClass('chat-collapsible', 'k')
    expect(details.open).toBe(false)
    details.open = true
    fireEvent(details, new Event('toggle'))
    // Controlled: callback fires but internal state is not used.
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('controlled toggle without onOpenChange does not throw', () => {
    render(
      <Collapsible open header={<span>NoCb</span>}>
        <p>B</p>
      </Collapsible>,
    )
    const details = screen.getByText('NoCb').closest('details') as HTMLDetailsElement
    details.open = false
    expect(() => fireEvent(details, new Event('toggle'))).not.toThrow()
  })
})

describe('CodeBlock', () => {
  it('renders code and omits data-language when absent', () => {
    render(<CodeBlock code="const a = 1" />)
    const pre = screen.getByText('const a = 1').closest('pre') as HTMLElement
    expect(pre).toHaveClass('chat-codeblock')
    expect(pre).not.toHaveAttribute('data-language')
  })

  it('sets data-language and className when provided', () => {
    render(<CodeBlock code="x" language="ts" className="cb" />)
    const pre = screen.getByText('x').closest('pre') as HTMLElement
    expect(pre).toHaveAttribute('data-language', 'ts')
    expect(pre).toHaveClass('cb')
  })
})

describe('JsonView', () => {
  it('pretty-prints a serializable value as json', () => {
    render(<JsonView value={{ a: 1 }} className="jv" />)
    const pre = document.querySelector('.chat-jsonview') as HTMLElement
    expect(pre).toHaveAttribute('data-language', 'json')
    expect(pre.textContent).toContain('"a": 1')
  })

  it('falls back to String() for non-serializable (circular) values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    render(<JsonView value={circular} />)
    const pre = document.querySelector('.chat-jsonview') as HTMLElement
    expect(pre.textContent).toBe('[object Object]')
  })

  it('falls back to String() when JSON.stringify returns undefined', () => {
    render(<JsonView value={undefined} />)
    const pre = document.querySelector('.chat-jsonview') as HTMLElement
    expect(pre.textContent).toBe('undefined')
  })
})

describe('ScrollArea', () => {
  it('wraps children with the scrollarea class and forwards className', () => {
    render(<ScrollArea className="s">content</ScrollArea>)
    const el = screen.getByText('content')
    expect(el).toHaveClass('chat-scrollarea', 's')
  })
})

describe('Avatar', () => {
  it('renders an uppercased initial and role attributes', () => {
    // Spread props so biome's a11y `role` heuristic doesn't fire on this custom
    // component's `role` prop (it is not a DOM aria role).
    render(<Avatar {...{ role: 'assistant' as const, className: 'a' }} />)
    const el = screen.getByLabelText('assistant')
    expect(el).toHaveTextContent('A')
    expect(el).toHaveAttribute('data-role', 'assistant')
    expect(el).toHaveClass('chat-avatar', 'a')
  })
})

describe('CopyButton', () => {
  const realClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: realClipboard,
      configurable: true,
    })
  })

  it('copies via the Clipboard API and reflects the copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<CopyButton value="hello" className="cp" aria-label="Copy code" />)
    const btn = screen.getByRole('button', { name: 'Copy code' })
    expect(btn).toHaveClass('chat-copybutton', 'cp')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(btn).toHaveAttribute('data-copied', 'true')
  })

  it('still flips to copied when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('nope'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    render(<CopyButton value="x" />)
    const btn = screen.getByRole('button', { name: 'Copy' })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(btn).toHaveAttribute('data-copied', 'true')
  })

  it('degrades gracefully when the clipboard object is absent', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    render(<CopyButton value="x" />)
    const btn = screen.getByRole('button', { name: 'Copy' })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('data-copied', 'true')
  })

  it('degrades gracefully when navigator itself is undefined (server-like)', () => {
    render(<CopyButton value="x" />)
    const btn = screen.getByRole('button', { name: 'Copy' })
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
    try {
      fireEvent.click(btn)
      expect(btn).toHaveAttribute('data-copied', 'true')
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    }
  })
})

describe('SSR safety (renderToStaticMarkup without window access during render)', () => {
  let originalNavigator: PropertyDescriptor | undefined

  beforeEach(() => {
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  })

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  it('renders every primitive to static markup with no global navigator/window', () => {
    // Simulate a server context: remove navigator so any render-time access throws.
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
    const markup = renderToStaticMarkup(
      <div>
        <Button>b</Button>
        <Badge tone="success">s</Badge>
        <Tooltip content="t">
          <span>x</span>
        </Tooltip>
        <Collapsible defaultOpen header="h">
          body
        </Collapsible>
        <CodeBlock code="c" language="ts" />
        <JsonView value={{ k: 1 }} />
        <ScrollArea>sc</ScrollArea>
        <Avatar {...{ role: 'user' as const }} />
        <CopyButton value="v" />
      </div>,
    )
    expect(markup).toContain('chat-button')
    expect(markup).toContain('chat-badge')
    expect(markup).toContain('chat-collapsible')
    expect(markup).toContain('chat-codeblock')
    expect(markup).toContain('chat-jsonview')
    expect(markup).toContain('chat-scrollarea')
    expect(markup).toContain('chat-avatar')
    expect(markup).toContain('chat-copybutton')
  })
})
