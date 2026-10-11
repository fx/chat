/**
 * The `<Text>` every component in this package draws with: Ink's `Text`, its
 * string children (directly, in arrays and in fragments) cleaned of terminal
 * control sequences. Layout cleans content where it enters (so widths are
 * measured on what is drawn); this is the last guard for strings handed in
 * as props. The bound `ink` export stays the host's own, untouched.
 */
import type { ComponentProps, ReactNode } from 'react'
import { type InkApi, React, ink } from './runtime'
import { stripControls } from './sanitize'

function clean(node: ReactNode): ReactNode {
  if (typeof node === 'string') return stripControls(node)
  if (Array.isArray(node)) return node.map(clean)
  if (React.isValidElement<{ children?: ReactNode }>(node) && node.type === React.Fragment)
    return withChildren(node.props.children, (kids) => React.cloneElement(node, undefined, ...kids))
  return node
}

/** Rebuild with cleaned children, passed as arguments (as JSX does) so none needs a key. */
function withChildren<T>(children: ReactNode, build: (kids: ReactNode[]) => T): T {
  return build(Array.isArray(children) ? children.map(clean) : [clean(children)])
}

export type TextProps = ComponentProps<InkApi['Text']>

export function Text({ children, ...props }: TextProps) {
  return withChildren(children, (kids) => React.createElement(ink.Text, props, ...kids))
}
