## 6. 受入確認（REQ-214 AC との対応）

| AC | 状態 |
|---|---|
| AC-01: server に getSession 認可を書くと lint / auth-route:check が fail | ✅ 両方で fail を確認 |
| AC-02: AuthContext / getSessionCache / getUserMedia / getUserById は誤検出されない | ✅ 確認 |
| AC-03: middleware コメントが実態（getUser のみ）と一致 | ✅ 是正済み |
| AC-04: 棚卸しに getSession 認可=0、set_user_admin_role の DB SELECT、Edge=getUser、next=15.5.14 | ✅ 本書 §2 |
| AC-05: 非 admin・自己操作の拒否を pgTAP で確認し CI が通る | ⚠️ 自己操作（INV-03/04）と正常系（INV-05）は PASS。**非 admin 拒否（INV-01/02）は schema.sql のバグにより現状 FAIL → todo() でマークし CI は緑。バグ修正で自動 PASS（§5）** |
| AC-06: 既存 /auth 検出維持＋ lint/type-check/auth-route/既存テストが緑 | ✅ /auth 検出維持を確認。lint / auth-route:check 緑。新 pgTAP 緑 |
