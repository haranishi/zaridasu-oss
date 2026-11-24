# 初参加向けIssueの下書き

公開後に、保守者がIssueとして立てる4件の下書き。どれも2026-11-24に、develop（`dadbb24`）の実在するコードで確かめた。
対象は、どのテストからも参照されていない小さなモジュール。テストを1ファイル足せば終わる大きさにしてある。ラベルは `good first issue`。
返信の時期は約束しない（[CONTRIBUTING.md](../../../CONTRIBUTING.md)）。質問はIssueのコメントで受ける。

共通の確認コマンドは次のとおり。PRの送り先は `develop`。テストの書き方は、`src/lib/__tests__/` の他のファイルに合わせる。

```sh
npm ci
npx vitest run <追加したテストのパス>
npm run lint
npm run type-check
```

## 1. `csvCell` のテストを足す（目安30分）

**背景**　`src/lib/csv.ts` の `csvCell` は、公開データセット（`src/app/dataset/zaridasu.csv/route.ts`）と管理画面が、CSVの1セルを書き出すのに使う。利用者が書いた文字列を表計算ソフトで開いても、数式として実行されないようにする関数だ。先頭が `=`・`+`・`-`・`@`・タブ・CRなら `'` を付け、`"`・`,`・改行を含むなら引用符で囲う。どのテストからも参照されていない。

**やること**　`src/lib/__tests__/csv.test.ts` を作り、次を確かめる。

- `null` と `undefined` は、空文字になる。
- 先頭が数式の文字なら、`'` が付く。
- `,`・`"`・改行を含むなら、引用符で囲み、内側の `"` は二重にする。
- 両方に当たるときは、`'` を付けてから囲う。`=a,b` は `"'=a,b"` になる。
- 数値は文字列として扱う。負の数（`-5`）も `'-5` になる。この挙動を仕様として固定してよいかは、Issueで相談してください。

**完了条件**　上の場合がテストで通る。lintと型検査が通る。

## 2. 撮影アドバイスのコードの一致をテストで守る（目安60分）

**背景**　`src/lib/aiAdvice.ts` は、AIの撮影アドバイス（6種類のコード）を、表示側で扱う。`ADVICE_CODES` は、Edge Functionの `supabase/functions/_shared/aiSchema.ts` にある `ADVICE_ENUM` と同じにする約束だ。表示文言は、翻訳キー `detail.aiAdvice.<コード>`。いまは両方の一覧が一致し、4言語とも6つのキーがそろっている。それを守るテストが無い。

**やること**　`src/lib/__tests__/aiAdvice.test.ts` を作る。

- `filterAdviceCodes`：既知のコードだけを、順番どおりに残す。未知のコード、配列でない値、`null`、`undefined` は、空配列にする。
- `adviceLabelKey`：`detail.aiAdvice.<コード>` を返す。
- 応用：`ADVICE_CODES` と `ADVICE_ENUM` が同じ集合であることを、ファイルを読んで確かめる。
- 応用：`ja`・`en`・`ko`・`zh` の翻訳に、全コードのキーがあることを確かめる。

**完了条件**　基本の2つがテストで通る。応用は、できた分だけでよい。

## 3. `toThumbnailUrl` のテストと、`?` を含むURLの扱い（目安45分）

**背景**　`src/lib/imageUtils.ts` の `toThumbnailUrl` は、Supabase Storageの公開URLを画像変換のURLに直し、`?width=…&quality=80` を付ける。使っているのは `PostCard.tsx` だけ。URLにすでに `?` があると、`…a.jpg?t=1?width=200&quality=80` のように壊れた形になる（コードで確かめた）。いまの呼び出し元で実際に起きるかは、確かめていない。

**やること**　`src/lib/__tests__/imageUtils.test.ts` を作る。

- 空・`null`・`undefined` は、そのまま返る。
- Storageの公開URLでないものは、変わらない。
- Storageの公開URLは、変換URLになる。幅の既定は200で、指定もできる。
- `?` を含むURLの結果を、テストで決める。直す場合は、`&` でつなぐ形にする。直すかどうかは、Issueで相談してください。

**完了条件**　上の場合がテストで通る。直す場合は、直したことがテストで分かる。

## 4. `getDateLocale` のテスト（目安20分）

**背景**　`src/lib/dateLocales.ts` の `getDateLocale` は、言語コードから、日付の表示に使うdate-fnsのロケールを選ぶ。9つのファイルが使っている。未対応の言語は日本語（`ja`）に戻る。専用のテストが無い。

**やること**　`src/lib/__tests__/dateLocales.test.ts` を作る。

- `ja`・`en`・`zh`・`ko` で、それぞれのロケールが返る。
- 未対応の言語コードと空文字は、`ja` になる。
- 応用：`en-US` のように地域が付いた値を渡したときの結果を、テストで決める。いまは未対応として `ja` に戻る。呼び出し元が地域つきの値を渡すかは、確かめていない。直すかどうかは、Issueで相談してください。

**完了条件**　基本の2つがテストで通る。
