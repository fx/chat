import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  ChatProvider,
  mergeClassNames,
  mergeRegistry,
  useChatClassNames,
  useChatComponents,
} from './context'
import type { ButtonProps, ChatClassNames, IconProps } from './contract'
import { headlessComponents } from './headless'

/** Probe component that renders slot identities from the effective registry. */
function Probe() {
  const c = useChatComponents()
  return (
    <div>
      <span data-testid="button-name">{c.Button.name || 'anon'}</span>
      <span data-testid="badge-name">{c.Badge.name || 'anon'}</span>
      <span data-testid="copy-icon-name">{c.icons.copy.name || 'anon'}</span>
      <span data-testid="check-icon-name">{c.icons.check.name || 'anon'}</span>
    </div>
  )
}

const CustomButton = (props: ButtonProps) => (
  <button type="button" data-custom="btn">
    {props.children}
  </button>
)
const CustomBadge = (props: { children?: ReactNode }) => (
  <span data-custom="badge">{props.children}</span>
)
const CustomCopyIcon = (_props: IconProps) => <i data-custom="copy-icon" />

describe('useChatComponents', () => {
  it('falls back to headless defaults with no provider', () => {
    render(<Probe />)
    expect(screen.getByTestId('button-name')).toHaveTextContent('Button')
    expect(screen.getByTestId('badge-name')).toHaveTextContent('Badge')
  })
})

describe('ChatProvider', () => {
  it('renders as headless when given no components', () => {
    render(
      <ChatProvider>
        <Probe />
      </ChatProvider>,
    )
    expect(screen.getByTestId('button-name')).toHaveTextContent('Button')
    expect(screen.getByTestId('badge-name')).toHaveTextContent('Badge')
  })

  it('renders with no children without throwing', () => {
    const { container } = render(<ChatProvider />)
    expect(container).toBeTruthy()
  })

  it('overrides only supplied keys, falling back to headless for the rest', () => {
    render(
      <ChatProvider components={{ Button: CustomButton }}>
        <Probe />
      </ChatProvider>,
    )
    expect(screen.getByTestId('button-name')).toHaveTextContent('CustomButton')
    // Partial override → Badge stays headless.
    expect(screen.getByTestId('badge-name')).toHaveTextContent('Badge')
  })

  it('deep-merges the icons map, preserving non-overridden icons', () => {
    render(
      <ChatProvider components={{ icons: { copy: CustomCopyIcon } }}>
        <Probe />
      </ChatProvider>,
    )
    expect(screen.getByTestId('copy-icon-name')).toHaveTextContent('CustomCopyIcon')
    // The non-overridden icon is preserved from headless.
    expect(screen.getByTestId('check-icon-name')).toHaveTextContent('Check')
  })

  it('nested providers preserve outer overrides and override only inner keys', () => {
    render(
      <ChatProvider components={{ Button: CustomButton }}>
        <ChatProvider components={{ Badge: CustomBadge }}>
          <Probe />
        </ChatProvider>
      </ChatProvider>,
    )
    // Inner override applies.
    expect(screen.getByTestId('badge-name')).toHaveTextContent('CustomBadge')
    // Outer override is preserved through the nested provider.
    expect(screen.getByTestId('button-name')).toHaveTextContent('CustomButton')
  })

  it('nested icon overrides merge across both providers', () => {
    const OuterCopy = (_p: IconProps) => <i data-x="outer-copy" />
    Object.defineProperty(OuterCopy, 'name', { value: 'OuterCopy' })
    render(
      <ChatProvider components={{ icons: { copy: OuterCopy } }}>
        <ChatProvider components={{ icons: { check: CustomCopyIcon } }}>
          <Probe />
        </ChatProvider>
      </ChatProvider>,
    )
    // Outer copy override survives; inner adds check; both differ from headless.
    expect(screen.getByTestId('copy-icon-name')).toHaveTextContent('OuterCopy')
    expect(screen.getByTestId('check-icon-name')).toHaveTextContent('CustomCopyIcon')
  })
})

describe('icon overrides reach the built-in headless primitives', () => {
  it('Collapsible and CopyButton resolve their icons from the effective registry', () => {
    const Caret = (_p: IconProps) => <i data-icon="caret" />
    const CopyIcon = (_p: IconProps) => <i data-icon="copy" />
    render(
      <ChatProvider components={{ icons: { caretRight: Caret, copy: CopyIcon } }}>
        <headlessComponents.Collapsible header="h">body</headlessComponents.Collapsible>
        <headlessComponents.CopyButton value="v" />
      </ChatProvider>,
    )
    // The overridden caret (closed → caretRight) and copy icon render, proving
    // icon-only overrides flow into the default primitives.
    expect(document.querySelector('[data-icon="caret"]')).toBeTruthy()
    expect(document.querySelector('[data-icon="copy"]')).toBeTruthy()
  })
})

/** Probe that renders selected effective class-name keys for assertions. */
function ClassNamesProbe() {
  const cn = useChatClassNames()
  return (
    <div>
      <span data-testid="cn-log">{cn.log ?? 'none'}</span>
      <span data-testid="cn-message">{cn.message ?? 'none'}</span>
    </div>
  )
}

describe('useChatClassNames', () => {
  it('returns an empty map with no provider (every key absent)', () => {
    render(<ClassNamesProbe />)
    expect(screen.getByTestId('cn-log')).toHaveTextContent('none')
    expect(screen.getByTestId('cn-message')).toHaveTextContent('none')
  })

  it('is empty when a provider supplies no classNames', () => {
    render(
      <ChatProvider>
        <ClassNamesProbe />
      </ChatProvider>,
    )
    expect(screen.getByTestId('cn-log')).toHaveTextContent('none')
  })

  it('exposes the classNames a provider supplies', () => {
    render(
      <ChatProvider classNames={{ log: 'host-log', message: 'host-message' }}>
        <ClassNamesProbe />
      </ChatProvider>,
    )
    expect(screen.getByTestId('cn-log')).toHaveTextContent('host-log')
    expect(screen.getByTestId('cn-message')).toHaveTextContent('host-message')
  })

  it('nested providers shallow-merge classNames, inner key wins, outer preserved', () => {
    render(
      <ChatProvider classNames={{ log: 'outer-log', message: 'outer-message' }}>
        <ChatProvider classNames={{ message: 'inner-message' }}>
          <ClassNamesProbe />
        </ChatProvider>
      </ChatProvider>,
    )
    // Inner overrides `message`; the outer `log` survives the nested provider.
    expect(screen.getByTestId('cn-message')).toHaveTextContent('inner-message')
    expect(screen.getByTestId('cn-log')).toHaveTextContent('outer-log')
  })

  it('a nested provider with no classNames inherits the outer map unchanged', () => {
    render(
      <ChatProvider classNames={{ log: 'outer-log' }}>
        <ChatProvider>
          <ClassNamesProbe />
        </ChatProvider>
      </ChatProvider>,
    )
    expect(screen.getByTestId('cn-log')).toHaveTextContent('outer-log')
  })
})

describe('mergeClassNames', () => {
  it('returns the inherited map unchanged when nothing is supplied', () => {
    const inherited: ChatClassNames = { log: 'a' }
    expect(mergeClassNames(inherited, undefined)).toBe(inherited)
  })

  it('shallow-merges supplied keys over inherited (supplied wins)', () => {
    const merged = mergeClassNames({ log: 'a', message: 'b' }, { message: 'c' })
    expect(merged).toEqual({ log: 'a', message: 'c' })
  })
})

describe('mergeRegistry', () => {
  it('returns the inherited registry unchanged when no components are supplied', () => {
    const merged = mergeRegistry(headlessComponents, undefined)
    expect(merged).toBe(headlessComponents)
  })

  it('shallow-merges primitives and deep-merges icons', () => {
    const merged = mergeRegistry(headlessComponents, {
      Button: CustomButton,
      icons: { copy: CustomCopyIcon },
    })
    expect(merged.Button).toBe(CustomButton)
    expect(merged.Badge).toBe(headlessComponents.Badge)
    expect(merged.icons.copy).toBe(CustomCopyIcon)
    expect(merged.icons.check).toBe(headlessComponents.icons.check)
  })

  it('handles an empty components object (no icons key)', () => {
    const merged = mergeRegistry(headlessComponents, {})
    expect(merged.Button).toBe(headlessComponents.Button)
    expect(merged.icons.copy).toBe(headlessComponents.icons.copy)
  })
})
