### 問題B: そもそもサーバー側ロックが一度も発火しない（設計主張が不成立） — High

カウンタが増えるのは `admin_login_record(..., p_success => false)` が呼ばれたときだけである。呼び出しているのはフロントエンドだけである（`src/views/admin/AdminLoginPage.tsx:117-131`：`admin_login_check` → `signInWithPassword` → 失敗時に `admin_login_record`）。

攻撃者は `/auth/v1/token?grant_type=password`（`signInWithPassword` の実体）を**直接**叩けばよく、その経路は `admin_login_check` も `admin_login_record` も呼ばない。つまり**ブルートフォース時にカウンタは 1 も増えず、ロックは一度も発火しない**。

これは migration 冒頭の設計主張

> `supabase/migrations/20260513000013_admin_login_rate_limit_audit.sql:3-9`
> 「旧実装のレート制限はクライアント sessionStorage のみで、DevTools / 別ブラウザ / SDK 直叩きで容易に迂回できた」→「これによりクライアントストレージのリセットでは迂回できない」

を**成立させていない**。保存場所が sessionStorage から Postgres に移っただけで、「クライアントが自発的に失敗を申告したときにしか記録されない」という迂回可能性の本質は変わっていない。REQ-149 の目的（サーバー側レート制限）は未達である。

なお `/auth/v1/*` には Supabase Auth 自身のレート制限が掛かるため「無制限に総当たりできる」わけではない。しかし**本アプリが用意したと考えているロック層は機能していない**。

### 問題C: `anon` が `audit_logs` に任意の行を無制限に注入できる（監査証跡の汚染＋ストレージ DoS） — High

`audit_logs` は RLS で INSERT を admin のみに限定している。

```sql
-- supabase/schema.sql:649-651
CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

しかし `admin_login_record` は `SECURITY DEFINER` なのでこのポリシーをバイパスする。`anon` が `p_email` を任意に指定して呼べるため、

- `p_success=false` → `:121-124` で **攻撃者が指定した `email_hash`・任意の `attempt_count`** を持つ `login_failed` 行を注入できる（`v_count` は攻撃者が呼び出し回数で操作できる）
- `p_success=true` → `:98-100` で `admin_id = auth.uid()` = **NULL** の `login_success` 行を注入できる。`login_success` が admin_id NULL で並ぶため、「誰が成功したか分からない成功記録」で本物の記録を埋没させられる

さらに `audit_logs` は設計上 **UPDATE / DELETE が不可**である（`schema.sql:643-651` に SELECT / INSERT のポリシーのみを定義し、`:653` のコメントが「整合性保護のため UPDATE/DELETE 不可 (REQ-020 / REQ-134)」と明記）。したがって注入された行は**管理者にも消せない**。結果として

1. **監査証跡の汚染**: 本物のログイン失敗／成功が偽の行に埋もれ、侵害調査が妨害される（管理画面の `get_audit_logs` にもそのまま出る）
2. **ストレージ DoS**: 削除手段が無いまま無制限に行を増やせる

append-only 設計（改竄防止のための正しい設計）と「anon が書ける」ことが組み合わさって、**改竄防止が逆に「消せない汚染」を保証してしまっている**。

---
