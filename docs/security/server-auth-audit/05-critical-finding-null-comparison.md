## 5. 重大な発見 — `set_user_admin_role` の NULL 比較バグ（要対応・本 REQ 変更対象外）

> ⚠️ **本 REQ（REQ-214）は schema.sql を「参照のみ・変更しない」と定めているため未修正。
> 別途の修正判断が必要。** これは権限昇格に直結する脆弱性であり、優先対応を推奨する。

### 5-1. 症状

`set_user_admin_role` の管理者チェック:

```sql
IF caller_role != 'admin' THEN
  RAISE EXCEPTION '管理者権限が必要です';
END IF;
```

呼び出し元の `raw_app_meta_data` に `role` キーが無い（= `caller_role IS NULL`）場合、
SQL の三値論理で `NULL != 'admin'` は **NULL（偽）** となり、`RAISE EXCEPTION` が**発火しない**。
結果として:

1. **role を持たない通常ユーザー（= 一般ユーザー全員）が、他ユーザーを admin に昇格できてしまう。**
   （自己昇格は別ガードで防がれるが、共謀すれば相互に昇格可能。）
2. **admin を剥奪された旧管理者**は、剥奪時に `role` キーが除去され `NULL` になるため、
   freshness チェックを素通りして昇格を続行できる。**§4 が主張する freshness 保護が実際には破れている。**

### 5-2. 再現（pgTAP / 手動の両方で確認済み 2026-06-16）

- 非 admin（`raw_app_meta_data = '{}'`）の呼び出し元で
  `set_user_admin_role(other, true)` → 例外が出ず other が admin になる。
- admin を剥奪した旧管理者（DB role = NULL、旧 JWT は `role=admin`）で
  `set_user_admin_role(victim, true)` → victim が admin になる。

`supabase/tests/rls_set_user_admin_role.sql` の INV-01 / INV-02 がこの欠陥を捕捉する。
現状コードでは両者が落ちるため `todo()` でマークし CI を緑に保ちつつ「修正されれば自動的に
ok へ変わる」回帰センチネルとして残している。INV-03/04/05（自己操作禁止・正常系）は現状 PASS。

### 5-3. 推奨修正（1 行）

NULL セーフな比較に変更する:

```sql
-- 変更前
IF caller_role != 'admin' THEN
-- 変更後（推奨）
IF caller_role IS DISTINCT FROM 'admin' THEN
```

修正後は INV-01 / INV-02 が PASS に転じる。その際、テストの該当 `todo()` 行を削除して
通常の `ok` アサーションに戻すこと（pgTAP は「TODO なのに成功した」テストを警告するため、
削除し忘れても気づける）。

---
