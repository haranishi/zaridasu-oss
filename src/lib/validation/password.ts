/**
 * REQ-152: パスワード強度バリデーションの共通モジュール
 *
 * サインアップ（AuthModal）とパスワードリセット（AuthCallbackPage）の両経路で
 * 同一の強度ポリシーを適用するための単一ソース。ポリシーを変更する場合はここだけを
 * 直せば全経路に反映される。
 *
 * ポリシー: 8 文字以上 ＋ 英字を 1 文字以上 ＋ 数字を 1 文字以上
 */

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordStrengthResult {
  valid: boolean
  /** 検証失敗時の i18n キー（valid=true のときは undefined） */
  messageKey?: string
}

/**
 * パスワードがポリシーを満たすか検証する。
 * メッセージはハードコードせず i18n キーで返し、呼び出し側で t() する。
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    !/[a-zA-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return { valid: false, messageKey: 'auth.errors.passwordRequirements' }
  }
  return { valid: true }
}

/** パスワード要件チェックリスト UI 用の各ルールの達成状況。key は i18n キー（auth.passwordRules.*）と対応。 */
export interface PasswordRuleCheck {
  key: 'minLength' | 'hasLetter' | 'hasNumber'
  met: boolean
}

/**
 * REQ-159: チェックリスト表示用に各ルールの達成状況を返す。
 * 表示順（minLength → hasLetter → hasNumber）と判定ロジックは validatePasswordStrength と一致させる。
 */
export function passwordRuleChecks(password: string): PasswordRuleCheck[] {
  return [
    { key: 'minLength', met: password.length >= PASSWORD_MIN_LENGTH },
    { key: 'hasLetter', met: /[a-zA-Z]/.test(password) },
    { key: 'hasNumber', met: /[0-9]/.test(password) },
  ]
}
