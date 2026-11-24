### 問題B: Edge Function 5 本にハンドラテストが無い — High

関数ディレクトリ 14 本のうち、テストファイルを持つのは 9 本。**未テストの 5 本はいずれも外部へ送信する副作用を持つ**。

| 関数 | 副作用 | `serve()` の位置 |
|---|---|---|
| `notify-dormant-reengage` | 休眠復帰メール送信 | `index.ts:43` |
| `notify-research-adopted` | 研究採用通知メール送信 | `index.ts:50` |
| `notify-weekly-digest` | 週次ダイジェストメール送信 | `index.ts:73` |
| `send-push` | Web Push 配信 | `index.ts:52` |
| `social-announce` | SNS 公開用 JSON の Storage 書き込み | `index.ts:197` |

`_shared/__tests__/mailer.test.ts` と `webpush.test.ts` は共通部品のみをカバーしている。ただし守備範囲の切り分けは正確に把握しておく必要がある。

**共通部品側は既にテスト済み**: `_shared/mailer.ts:44-50` の `OPT_IN_COLUMN`（`research_adopted` → `notify_research_adopted` ほか）と `:126-136` のオプトイン判定は `mailer.test.ts:79`「opt-out なら送らない（fetch されない）」で検証されている。したがって「共通メーラを正しく呼べば配信停止希望者へは送られない」ことは担保されている。

**未検証なのはハンドラ側の分岐**である。具体的には次の 4 点。

1. **カテゴリ literal の正しさ**: 各ハンドラは `sendLifecycleEmail({ …, category: '…' })` に文字列リテラルを渡している（`notify-dormant-reengage:98` / `notify-research-adopted:107` / `notify-weekly-digest:165`）。**コピペで category を取り違えると、別カテゴリのオプトイン列を見て送信する**（例: 週次ダイジェストを停止した利用者へ週次ダイジェストが届く）。型は `LifecycleCategory` で守られるが、どのハンドラがどのカテゴリを渡すかは型では決まらないためテストでしか固定できない。
2. **`send-push` のオプトアウト判定は共通部品を経由していない**。`send-push/index.ts:85-95` で自前実装している。
   ```ts
   if (!profile || (profile as unknown as Record<string, unknown>)[col] === false) {
     return jsonOk({ skipped: 'push_opt_out', category })
   }
   ```
   `PUSH_OPT_IN_COLUMN`（`:37-41`）の 3 カテゴリ（`post_status` / `comment` / `nearby`）に対するこの分岐は**完全に未検証**である。`as unknown as Record<string, unknown>` で型の助けも無い。ここが壊れると配信停止希望者へ Push が届く。
3. **webhook secret の 401 経路**: 5 本すべてが `requireWebhookSecret` を import している（`notify-dormant-reengage:19` / `notify-research-adopted:23` / `notify-weekly-digest:20` ほか）が、401 を返すことをハンドラ単位で確認するテストが無い。
4. **対象 0 件時の挙動**（`skipped` を返して 200 で終わるか）と**宛先列挙**（週次 500 件・休眠 200 件の上限ループ）。

### 問題C: 既存の「handler テスト」は 2 系統あり、片方はハンドラを実行していない — 実装上の前提

FR を書くうえで決定的な制約がある。既存の 9 本のテストは中身が 2 種類に分かれる。

**(a) ハンドラを実際に呼ぶテスト**（`import { handleRequest } from '../index.ts'` + `fetch` モック → `res.status` / レスポンス JSON をアサート）

```
enrich-place/index.ts:65               export async function handleRequest(req: Request): Promise<Response>
notify-ai-anomaly/index.ts:130         同
notify-gemini-key-failure/index.ts:80  同
health-gemini/index.ts:159             同
analyze-audio/index.ts:544             同
```

**(b) ソーステキストを読んで正規表現でアサートするだけのテスト**（`Deno.readTextFile(index.ts)` → `assert(src.includes(...))`）

`notify-comment` / `notify-post-status` / `notify-survey-request` の `__tests__/handler.test.ts` がこれで、冒頭コメントに理由が明記されている。

> notify-comment は `serve(async (req) => …)` を直接呼び出してハンドラを export していないため、現状リポジトリでは handler 単位の直接呼び出しはできない。本テストでは source-level smoke check として…

つまり **`notify-comment/__tests__/handler.test.ts` は「skipped / 200 / 401 をアサートする」テストの雛形にはならない**（HTTP レスポンスを一切見ていない）。今回の対象 5 本はいずれもインライン `serve(async (req) => …)` で `handleRequest` を export していないため、**実際に検証できるテストを書くには先にハンドラの export 化が必要**である。雛形にすべきは `notify-ai-anomaly/__tests__/handler.test.ts`（`fetch` モック＋分岐ごとの `skipped` アサート）と `enrich-place/__tests__/handler.test.ts`（webhook secret 不一致で 401、kill switch で skip）である。

