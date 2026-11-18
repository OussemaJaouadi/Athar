import { describe, expect, test } from 'bun:test'

import { isOperatorCookie, operatorToken } from './auth'

describe('operator cookie', () => {
  test('the token is stable, hex, and differs per passphrase', () => {
    expect(operatorToken('a')).toBe(operatorToken('a'))
    expect(operatorToken('a')).toMatch(/^[0-9a-f]{64}$/)
    expect(operatorToken('a')).not.toBe(operatorToken('b'))
    expect(operatorToken('')).not.toBe(operatorToken('a'))
  })

  test('the word operator is rejected when a passphrase is set', () => {
    expect(isOperatorCookie('operator', 'secret')).toBe(false)
    expect(isOperatorCookie('operator', 'operator')).toBe(false)
  })

  test('the word operator is accepted when no passphrase is set', () => {
    expect(isOperatorCookie('operator', undefined)).toBe(true)
    expect(isOperatorCookie('operator', '')).toBe(true)
    expect(isOperatorCookie('user', undefined)).toBe(false)
  })

  test('the right token is accepted', () => {
    expect(isOperatorCookie(operatorToken('secret'), 'secret')).toBe(true)
  })

  test('undefined and empty cookies are rejected either way', () => {
    expect(isOperatorCookie(undefined, 'secret')).toBe(false)
    expect(isOperatorCookie('', 'secret')).toBe(false)
    expect(isOperatorCookie(undefined, undefined)).toBe(false)
    expect(isOperatorCookie('', undefined)).toBe(false)
  })

  test('a token for an old passphrase is rejected after a change', () => {
    const old = operatorToken('old phrase')
    expect(isOperatorCookie(old, 'old phrase')).toBe(true)
    expect(isOperatorCookie(old, 'new phrase')).toBe(false)
  })

  test('input of another length does not throw', () => {
    expect(isOperatorCookie('x', 'secret')).toBe(false)
    expect(isOperatorCookie('x'.repeat(500), 'secret')).toBe(false)
    expect(isOperatorCookie(operatorToken('secret') + '0', 'secret')).toBe(false)
    expect(isOperatorCookie(operatorToken('secret').slice(1), 'secret')).toBe(false)
  })
})
