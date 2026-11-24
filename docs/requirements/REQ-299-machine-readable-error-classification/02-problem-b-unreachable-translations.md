### 問題B: P0001 の `raw` 優先で 4 言語の `errors.rateLimitServer` が到達不能になっている — Medium

`src/lib/errorHandler.ts:99-102`:

```ts
if (e.code === 'P0001') {
  const raw = typeof e.message === 'string' ? e.message : ''
  return raw ? { key: 'errors.rateLimitServer', raw } : { key: 'errors.rateLimitServer' }
}
```

`src/lib/errorHandler.ts:50-56`:

```ts
export function resolveErrorMessage(msg, translate): string {
  if (msg.raw != null && msg.raw !== '') return msg.raw   // ← :54
  return translate(msg.key, msg.params)
}
```

DB トリガーは**必ず**メッセージ付きで `RAISE EXCEPTION` するため `raw` は常に埋まる。したがって `errors.rateLimitServer` の翻訳は**一度も表示されない**。翻訳自体は 4 言語そろっている。

| ロケール | 場所 |
|---|---|
| ja | `src/locales/ja/translation.json:28` |
| en | `src/locales/en/translation.json:1319` |
| zh | `src/locales/zh/translation.json:1319` |
| ko | `src/locales/ko/translation.json:1319` |

`npm run i18n:check`（`scripts/check-i18n-parity.ts`）はキーの**存在**だけを見るため、この「到達不能な翻訳」を検知できない。

送出元の日本語ハードコードは `schema.sql` に少なくとも以下がある（`USING ERRCODE` なし）。

```
263  '24時間以内の投稿上限（5件）に達しました'
270  '投稿が集中しています。しばらくお待ちください'
457  'この投稿はすでに通報済みです'
464  '通報が集中しています。しばらくお待ちください'
551  'コメントが集中しています。しばらくお待ちください'
557  '24時間以内のコメント上限に達しました'
610  'いいねが集中しています。しばらくお待ちください'
757  '管理者権限が必要です'
762  '自分自身の管理者権限は変更できません'
2209 '調査依頼は1日3件までです'
2317 '認証が必要です'
```

さらに `schema.sql` に載っていない migration 側にも同型が 4 件ある（**こちらは `USING ERRCODE = 'P0001'` を明示しているが、種別の区別は文面のみ**）。

```
supabase/migrations/20260425000005_survey_request_comments.sql:38  'クローズ済みの依頼にはコメントできません'
supabase/migrations/20260425000005_survey_request_comments.sql:61  '24時間以内のコメント上限（30件）に達しました'
supabase/migrations/20260425000003_survey_request_responses.sql:59 'クローズ済みの依頼には応答できません'
supabase/migrations/20260425000003_survey_request_responses.sql:82 '24時間以内の応答上限（20件）に達しました'
```
