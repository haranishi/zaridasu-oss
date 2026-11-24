### 問題C: 利用者側の見え方 — en / zh / ko UI に日本語が出る — Medium

英語 UI でコメント上限に達する、調査依頼を 1 日 4 件目作ろうとする、といった操作で、`24時間以内のコメント上限に達しました` / `調査依頼は1日3件までです` などの日本語がそのまま表示される。

`errorHandler` を経由せず `err.message` を直接表示している経路もあり、そちらは `raw` 優先の話とは無関係に最初から日本語が出る。

- `src/hooks/survey/useSurveyRequests.ts:104`, `:229`
- `src/hooks/survey/useSurveyResponses.ts:89`
- `src/hooks/survey/useSurveyRequestComments.ts:67`

いずれも `setError(err instanceof Error ? err.message : String(err))` の形である（`useSurveyRequests` の表示側は REQ-273 問題C の対象と同一）。

### 問題D: 重複通報が「送信に失敗しました」に化ける — Medium

`src/components/modals/ReportModal.tsx:76-78`:

```ts
} catch (err) {
  logError(err, 'ReportModal:submit')
  setError(t('report.errorSubmit'))
```

エラー種別に関わらず `report.errorSubmit`（ja: 「送信に失敗しました。もう一度お試しください。」）を表示する。DB は種別を区別して投げているのに、**「既に通報済み」（`schema.sql:457`）とレート制限（`schema.sql:464`）が同じ文言に化ける**。ユーザーは一時障害だと思って何度も再送信を試みるが、実際には最初の通報が正常に受理済みである。
