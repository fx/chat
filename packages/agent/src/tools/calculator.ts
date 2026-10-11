/**
 * A safe arithmetic evaluator for the calculator tool — a small
 * recursive-descent parser, never `eval`.
 *
 * Grammar: numbers (incl. decimals and exponents), `+ - * / % ^` (`^` is
 * right-associative and binds tighter than unary minus), parentheses, the
 * constants `pi` and `e`, and the functions `sqrt abs round floor ceil ln log
 * log10 sin cos tan min max`.
 */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; value: string }
  | { kind: 'op'; value: string }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const re =
    /(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([a-zA-Z_][a-zA-Z0-9_]*)|(\*\*|[-+*/%^(),])/y
  let index = 0
  for (;;) {
    while (index < input.length && /\s/.test(input[index] as string)) index++
    if (index >= input.length) break
    re.lastIndex = index
    const match = re.exec(input)
    if (!match) throw new Error(`Unexpected character at position ${index + 1}`)
    index = re.lastIndex
    if (match[1] !== undefined) tokens.push({ kind: 'num', value: Number(match[1]) })
    else if (match[2] !== undefined) tokens.push({ kind: 'id', value: match[2].toLowerCase() })
    else tokens.push({ kind: 'op', value: match[3] === '**' ? '^' : (match[3] as string) })
  }
  return tokens
}

export function evaluate(expression: string): number {
  const tokens = tokenize(expression)
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (value: string) => {
    const t = peek()
    return t?.kind === 'op' && t.value === value
  }
  const expect = (value: string) => {
    if (!isOp(value)) throw new Error(`Expected "${value}"`)
    pos++
  }

  function expr(): number {
    let left = term()
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as Token).value
      const right = term()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function term(): number {
    let left = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (tokens[pos++] as Token).value
      const right = unary()
      if (op === '*') left *= right
      else if (op === '/') left /= right
      else left %= right
    }
    return left
  }

  function unary(): number {
    if (isOp('-')) {
      pos++
      return -unary()
    }
    if (isOp('+')) {
      pos++
      return unary()
    }
    return power()
  }

  function power(): number {
    const base = primary()
    if (isOp('^')) {
      pos++
      return base ** unary()
    }
    return base
  }

  function primary(): number {
    const token = peek()
    if (!token) throw new Error('Unexpected end of expression')
    pos++
    if (token.kind === 'num') return token.value
    if (token.kind === 'op') {
      if (token.value !== '(') throw new Error(`Unexpected "${token.value}"`)
      const value = expr()
      expect(')')
      return value
    }
    const fn = FUNCTIONS[token.value]
    if (fn && Object.hasOwn(FUNCTIONS, token.value)) {
      expect('(')
      const args = [expr()]
      while (isOp(',')) {
        pos++
        args.push(expr())
      }
      expect(')')
      return fn(...args)
    }
    if (Object.hasOwn(CONSTANTS, token.value)) return CONSTANTS[token.value] as number
    throw new Error(`Unknown name "${token.value}"`)
  }

  const value = expr()
  if (pos < tokens.length) throw new Error(`Unexpected "${(tokens[pos] as Token).value}"`)
  if (!Number.isFinite(value)) throw new Error('The result is not a finite number')
  return value
}
