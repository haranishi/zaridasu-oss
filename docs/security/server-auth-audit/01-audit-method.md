## 1. 監査方法

`grep -rn "getSession\|getUser\|getClaims" src supabase`（＋各ファイル確認）の全ヒットを
「認可に使用 / 表示用（クライアント）/ テスト / 非該当（誤検出語）」に分類した。

`getSession()` は Cookie/ローカルストレージのセッションをそのまま返し、サーバーで Cookie を
再検証しない。よってサーバー（SSR / Server Component / Server Action / Route Handler /
middleware / Edge Function）では認可に使わず、`getUser()`（Auth サーバーへ問い合わせ検証）
または `getClaims()`（JWT 署名検証）で検証する。

---
