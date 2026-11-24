import { describe, it, expect } from 'vitest'
import {
  validatePasswordStrength,
  passwordRuleChecks,
  PASSWORD_MIN_LENGTH,
} from '../password'

describe('validatePasswordStrength', () => {
  it('rejects passwords shorter than the minimum length (7 chars)', () => {
    // 7 文字・英字+数字ありだが長さ不足
    expect(validatePasswordStrength('abc1234')).toEqual({
      valid: false,
      messageKey: 'auth.errors.passwordRequirements',
    })
  })

  it('rejects 8 chars without a letter (digits only)', () => {
    expect(validatePasswordStrength('12345678').valid).toBe(false)
  })

  it('rejects 8 chars without a digit (letters only)', () => {
    expect(validatePasswordStrength('abcdefgh').valid).toBe(false)
  })

  it('rejects a short letter+digit password (abc123)', () => {
    expect(validatePasswordStrength('abc123').valid).toBe(false)
  })

  it('accepts exactly 8 chars with a letter and a digit', () => {
    expect(validatePasswordStrength('password1')).toEqual({ valid: true })
    expect(validatePasswordStrength('abcdefg1').valid).toBe(true)
  })

  it('PASSWORD_MIN_LENGTH is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })
})

describe('passwordRuleChecks', () => {
  it('returns the three rules in stable order', () => {
    expect(passwordRuleChecks('').map((r) => r.key)).toEqual([
      'minLength',
      'hasLetter',
      'hasNumber',
    ])
  })

  it('reflects met state per rule', () => {
    const checks = passwordRuleChecks('password1')
    expect(checks.every((r) => r.met)).toBe(true)

    const partial = passwordRuleChecks('abc')
    expect(partial.find((r) => r.key === 'minLength')?.met).toBe(false)
    expect(partial.find((r) => r.key === 'hasLetter')?.met).toBe(true)
    expect(partial.find((r) => r.key === 'hasNumber')?.met).toBe(false)
  })
})
