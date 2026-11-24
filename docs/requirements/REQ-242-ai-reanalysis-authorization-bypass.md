# REQ-242: AI 再解析エンドポイントの認可バイパス修正（未認証で他者投稿を再解析・非公開化できる）

## 背景
ザリダスの `analyze-image` / `analyze-audio` Edge Function は、(1) 投稿 INSERT を起点とする**初回解析**（Database Webhook 経由・`WEBHOOK_SECRET` で認証）と、(2) フロントからユーザーが手動で起動する**再解析（reanalysis）**の 2 経路を持つ。再解析は webhook 秘密を持たないため、代わりに「呼び出しユーザーが当該投稿の所有者か」を `getUser()` で検証する設計になっている。この所有者チェックの配置に穴があり、**未認証（公開 anon キーのみ）で他人の投稿を再解析・状態変更できる**認可バイパスが存在する。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 所有者チェックが `if (user)` の内側にネストされ、user 不在で丸ごとスキップされる
- `supabase/functions/analyze-image/index.ts:777-796`（再解析の所有者判定）／同 `:1174-1183`（承認済み投稿を `pending` に戻す処理）。`analyze-audio/index.ts:651-668` および `:957-958` も同型。
- 構造（要約）:
  ```js
  if (reanalysis) {
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {                         // ← 実ユーザートークンのときだけ入る
        if (!isAdminReanalysis) {
          if (current?.user_id !== user.id) return 403   // 唯一の所有権ゲート
        }
      }
    }
    if (!isAdminReanalysis) { /* レート制限 → そのまま解析へフォールスルー */ }
  }
  ```
- `supabase/config.toml` に `[functions.*] verify_jwt = false` の指定が無いため、関数は Supabase 既定の `verify_jwt = true` でデプロイされる。この既定は**クライアントバンドルに同梱される公開 anon キー（`NEXT_PUBLIC_SUPABASE_ANON_KEY`）でも充足**される。

### 2. 攻撃シナリオ（未認証で成立）
1. 攻撃者が `Authorization: Bearer <anon キー>` を付け（プラットフォームの `verify_jwt` を通過）、本文 `{"reanalysis":true,"record":{"id":"<被害者の投稿ID>"}}` を送る。承認済み投稿の ID は公開 posts API で列挙可能。
2. `getUser(anonキー)` は**ユーザーを返さない**ため `if (user)` ブロックに入らず、`current.user_id !== user.id` の所有権チェックが**素通り**する。
3. 実行はレート制限を経て解析本体へフォールスルーし、被害者の投稿を再解析する。
- **影響**:
  - (a) 被害者の写真/音声に対し新規 Gemini 呼び出しを強制（`analyze-image/index.ts:945-949`）＝**課金の意図的発生**。
  - (b) 被害者の**承認済み投稿を `pending` に降格**（`analyze-image/index.ts:1174-1183` / `analyze-audio/index.ts:957-958`）。`moderated_read` は `approved` のみ公開のため、**他者コンテンツを公開停止できる可用性/検閲プリミティブ**になる。
- **皮肉な非対称**: 実在の非所有者ユーザーとして認証すると 403 で正しく弾かれるのに、**anon キーだけを提示すると逆に多くのアクセスが得られる**。
- **緩和の限界**: post 単位 3/日（DB で永続）＋ caller 単位 ~20/24h（**インスタンスローカルのメモリ**で揮発・分散/再起動でリセット可）。上限は付くが問題自体は消えない。

## 目的
再解析経路を「検証済みユーザーが存在しなければ拒否（fail-closed）」に是正し、未認証・非所有者による他者投稿の再解析・状態変更を不可能にする。管理者再解析（`isAdminReanalysis`）と正規の所有者再解析は従来どおり動作させる。

## 要件

### 機能要件
- [ ] FR-242-01: 再解析経路で `getUser(token)` がユーザーを返さない場合は **401 で即時拒否**する（`if (!user) return 401`）。所有権チェック（`current.user_id !== user.id → 403`）を `if (user)` の**外側**に出し、user 不在でスキップされない構造にする（`analyze-image` / `analyze-audio` の両方）。
- [ ] FR-242-02: anon ロール（未ログイン）での再解析を明示的に拒否する。プラットフォーム `verify_jwt` が anon キーを通す前提に依存せず、アプリ側でユーザー JWT の実在（`user.id` かつ非 anon）を必須にする。
- [ ] FR-242-03: 承認済み→`pending` 降格を伴う分岐は、所有者本人または管理者のみが到達できることを保証する（FR-242-01 の前段ゲート通過後にのみ実行）。
- [ ] FR-242-04: 初回解析（webhook 経由）経路の認証は REQ-240（`WEBHOOK_SECRET` fail-closed 化）で担保する。本 REQ は再解析経路のユーザー認可に閉じ、両経路が別々の認証根拠を持つことを明確化する。

### 非機能要件
- [ ] NFR-242-01: 変更後も正規の所有者再解析・管理者再解析・初回解析が回帰しないこと（既存 `analyze-image/index.test.ts` / `analyze-audio/index.test.ts` を拡張）。
- [ ] NFR-242-02: 401/403 応答は情報を過剰に漏らさない（投稿の存在有無をオラクル化しない汎用メッセージ）。
- [ ] NFR-242-03: 本修正は REQ-212（レート制限）・REQ-218（AI killswitch）と多層で機能し、単独ゲート突破では課金・降格が起きないこと。

## 受入条件
- [ ] AC-01: `Authorization: Bearer <anonキー>` ＋ `{reanalysis:true, record:{id:<他者投稿>}}` のリクエストが **401 で拒否**され、Gemini 呼び出しも状態変更も発生しない。
- [ ] AC-02: 非所有者の実ユーザーによる再解析は 403 のまま。所有者本人・管理者の再解析は 200 で成功する。
- [ ] AC-03: 承認済み投稿が、所有者/管理者以外の操作で `pending` に降格されない（テストで確認）。
- [ ] AC-04: 初回解析（webhook）経路が REQ-240 の下で正常に動作する。
- [ ] AC-05: 追加テストが green（未認証拒否・非所有者 403・所有者成功・管理者成功）。

## 影響範囲
- `supabase/functions/analyze-image/index.ts`（:777-796 / :1174-1183）／`supabase/functions/analyze-audio/index.ts`（:651-668 / :957-958）
- `supabase/functions/analyze-image/index.test.ts` / `analyze-audio/index.test.ts`（回帰・新規ケース）
- `supabase/config.toml`（必要なら `verify_jwt` の明示・anon 拒否方針の記録）
- 関連 REQ: REQ-240（webhook fail-closed）、REQ-212（レート制限）、REQ-215（AI セキュリティ）、REQ-218（課金ガードレール）。

## 優先度
- **緊急度**: High / **重要度**: High
- **理由**: 未認証で「他者の課金を発生させる」「他者の承認済み投稿を公開停止する」という、越権・可用性・コストの複合被害が成立する。投稿 ID は公開列挙可能で悪用の敷居が低い。修正は所有者チェックの位置移動＋未認証拒否で局所的に完結し、副作用が小さい。Critical（REQ-239）に次ぐ優先。
