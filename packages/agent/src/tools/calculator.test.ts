// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { evaluate } from './calculator'

describe('evaluate', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['2 ** 3', 8],
    ['-2 ^ 2', -4],
    ['+5 - -3', 8],
    ['10 % 4', 2],
    ['7 / 2', 3.5],
    ['.5 + 1.5e1', 15.5],
    ['sqrt(16) + abs(-2)', 6],
    ['max(1, 5, 3) - min(4, 2)', 3],
    ['round(pi * 100) / 100', 3.14],
    ['floor(E) + ceil(0.1)', 3],
    ['log(1000) + ln(e)', 4],
  ])('%s = %d', (expression, expected) => {
    expect(evaluate(expression)).toBeCloseTo(expected)
  })

  it.each([
    ['1 +', 'Unexpected end of expression'],
    ['(1 + 2', 'Expected ")"'],
    ['1 2', 'Unexpected "2"'],
    ['* 3', 'Unexpected "*"'],
    ['foo(1)', 'Unknown name "foo"'],
    ['constructor', 'Unknown name "constructor"'],
    ['1 / 0', 'not a finite number'],
    ['2 $ 3', 'Unexpected character at position 3'],
    ['sqrt 4', 'Expected "("'],
  ])('rejects %s', (expression, message) => {
    expect(() => evaluate(expression)).toThrow(message)
  })

  it('ignores trailing whitespace', () => {
    expect(evaluate(' 4  ')).toBe(4)
  })
})
