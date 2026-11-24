## 4. 高リスク操作の freshness 方針（FR-214-05）

> **方針**: 権限昇格・剥奪・アカウント削除など高リスク操作は、JWT クレーム
> （`app_metadata.role`）だけで判断せず、**DB 側の role / 所属を都度再確認**する。
> JWT クレームは最後のトークン更新時点のスナップショットであり、剥奪直後の旧トークンには
> 古い `admin` が残り得る（freshness ギャップ）ため。

### 4-1. DB 側 re-check（設計意図）

`public.set_user_admin_role(target_user_id, grant_admin)`（`supabase/schema.sql`）は
呼び出し元の role を **JWT ではなく `auth.users.raw_app_meta_data` から都度 SELECT** して
検証する設計であり（`SELECT raw_app_meta_data->>'role' ... WHERE id = auth.uid()`）、
さらに自己昇格/自己剥奪を禁止する（`IF target_user_id = auth.uid() THEN RAISE`）。
**設計意図としては** freshness を満たす（剥奪直後の旧 JWT 保持者を DB SELECT で弾く）。

### 4-2. Edge Function の admin 判定（許容範囲として記録）

`health-gemini`（ヘルスチェック）と `analyze-image` の reanalysis（自分の投稿の再分析）は
`getUser(token)` で得た `user.app_metadata.role`（= JWT 由来クレーム）で admin を判定する。
getUser はトークンを Auth サーバーで検証するため「正規の本人」であることは担保されるが、
`app_metadata.role` は**最後のトークン更新時点のスナップショット**である（freshness ギャップ）。
対象は**低リスク操作**（情報露出 / レート増程度）であり、剥奪直後の数分間に旧トークンで叩けても
被害は限定的なため、**現状は JWT クレーム判定を許容**する。将来、より高リスクな操作を
Edge Function に追加する場合は DB 再確認（auth.users SELECT もしくは SECURITY DEFINER RPC 経由）に
寄せること。

### 4-3. 回帰テスト

`supabase/tests/rls_set_user_admin_role.sql`（pgTAP）で freshness / 自己操作禁止 / 正常系を検証する。
CI 環境の `auth.uid()` は `request.jwt.claims->>'sub'` を返すため、JWT に `role=admin` を載せつつ
DB 行を非 admin にすることで「JWT ではなく DB を見ているか」を直接検証できる。

---
