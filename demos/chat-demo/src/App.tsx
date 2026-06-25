import '@fx/chat/styles.css'
import { cx, version } from '@fx/chat'

/**
 * Bootstrap demo skeleton. The full three-registry demo arrives in a later
 * change. For now this proves the demo consumes the library through its public
 * package name and builds as a fully static site with no backend calls.
 */
export function App() {
  return (
    <main className={cx('demo', 'demo--bootstrap')}>
      <h1>@fx/chat</h1>
      <p>Design-system-agnostic React chat components.</p>
      <p>
        Library version: <code>{version}</code>
      </p>
    </main>
  )
}
