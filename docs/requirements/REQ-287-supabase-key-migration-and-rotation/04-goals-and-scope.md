## 3. 目的

1. Edge Function と DB ラッパが参照するキーを、レガシー `service_role` から新方式 `sb_secret_` へ切り替える
2. 切り替え完了後にレガシー `service_role` キーを無効化し、露出した値を失効させる
3. 「秘密値をトリガー定義・SQL・コミットに書かない」を検知可能なルールとして確立する
4. 作業をユーザー影響ゼロで完了する

---

## 4. スコープ外

- レガシー `anon` → `sb_publishable_` の切り替え（FR-287-06 で方針だけ決め、実施は別要件）
- git 履歴の書き換え・purge（今回は履歴に秘密値が無いため不要。手順は既存 runbook にある）
- Gemini API キーのローテーション（`docs/runbooks/gemini-key-rotation.md` の範囲）
- `webhook_secret` の Vault 登録と fail-closed 有効化（C のとおり別途判断）

---
