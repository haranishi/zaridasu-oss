# REQ-300: 入力データ喪失の防止（写真・音声・長文の保護）

作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **High**（問題A・D）〜Medium ／ 種別: UX（データ保全）
状態: **提案 / 未実装**
関連: REQ-273（データ取得失敗の可視化）, REQ-223（フォームUX・マイクロコピー）, REQ-201（地図エラーバウンダリ）, REQ-185（オフラインキューのデータ喪失）, REQ-189（調査依頼フォームa11y）

## 背景

ザリダスは**現地で撮影・録音する市民科学アプリ**であり、入力の喪失は「やり直せる操作の失敗」ではない。水辺を離れた後で写真も鳴き声も撮り直せないため、失われた観察記録は永久に戻らない。

**保護の仕組み自体はリポジトリ内に既にある。問題は適用範囲が中途半端なことである。**

| 保護 | 既にある実装 | 効かない範囲 |
|---|---|---|
| 草稿の自動保存 | `usePostDraft`（`PostForm.tsx:137` で呼び出し） | **保存対象に photos / audioBlob が無い**（問題A）。`SurveyRequestForm` には草稿保存自体が無い（問題B） |
| 離脱時の確認 | `beforeunload` 保護（`PostForm.tsx:128-134`） | **タブ/ウィンドウを閉じる操作にしか効かない**。モーダルを閉じる操作には効かない（問題A・B） |
| 破壊的操作前の確認 | 投稿削除＝ダイアログ、コメント削除＝インライン確認、調査依頼クローズ＝確認（REQ-273 FR-273-04） | フォームを閉じる操作には確認が無い（問題A・B） |
| 地図の局所エラーバウンダリ | `HomePage.tsx:419`（`context="MapView"`・:415-418 に「leaflet 描画例外を地図枠内に閉じ込め、最上位 providers.tsx の ErrorBoundary まで伝播させない」と明記）、`Crayfish3DStage.tsx:131-136` | **入力を保持している唯一の画面（投稿フォームの地図）だけ未隔離**（問題D） |
| ログイン必須時の説明 | `PostForm` 側は `submitPost` が `t('postForm.loginRequired')` を出す | `SurveyRequestForm.tsx:110` は `if (!user) return null` で無言消滅（問題C） |

つまり本 REQ は新しい仕組みの導入ではなく、**既存の保護方針を「入力を持っている画面」へ一貫適用する**ことを求める。

### 問題A: 投稿フォームを閉じると写真・音声が確認なしに消える — High

`src/components/features/posts/PostForm.tsx` には閉じる経路が3つあり、**いずれも確認なしで即 `onClose()`** する。

- 背景タップ: :226 `onClick={(e) => e.target === e.currentTarget && onClose()}`
- Escape キー: :71 `useEscapeKey(onClose)`
- × ボタン: :235 `onClick={onClose}`

草稿の自動保存（:137）は `usePostDraft({ position, species, infoType, municipality, comment, count, observedAt })` で呼ばれ、`usePostDraft.ts:8-18` が localStorage へ保存するが、**引数に `photos` と `audioBlob` が含まれていない**。`beforeunload` 保護（:128-134）は `hasData` 判定まで持っているが、ブラウザのタブ閉じ・リロードにしか介入せずモーダルを閉じる操作には無関係である。

具体シナリオ: 現地で写真を3枚選び、ザリガニの生息地でスマートフォンを片手に鳴き声を録音し、コメントを書いた状態で、ボトムシート外を誤タップする。フォームは即座に閉じる。再度開くと「前回の入力を復元しました」バナー（:243 付近の草稿復元バナー）は出るが、**写真と音声は空**で、しかも**消えたことの告知すらない**。ユーザーは復元バナーを見て「戻った」と誤認し、写真のない投稿を送信する。現地を離れていれば再撮影はできない。

### 問題B: 調査依頼フォームは長文の調査理由が復元手段なしに全消滅する — Medium

`src/components/modals/SurveyRequestForm.tsx`。閉じる経路は `PostForm` と同型（:63 `useEscapeKey(onClose)` / :124 背景タップ / :133 × ボタン）だが、**草稿保存も dirty 確認も一切ない**。

`MAX_SURVEY_REASON_LENGTH` の上限まで書いた「調査理由」（自由記述の長文）が、ボトムシート外の誤タップで消える。`PostForm` は `usePostDraft` で自動保存されるのに、同一プロダクト内で**長文フォームの保護方針が非対称**である。復元手段は存在しない。

### 問題C: セッション切れで調査依頼フォームが予告なくアンマウントされる — Medium

`src/components/modals/SurveyRequestForm.tsx:110` の `if (!user) return null`。`src/context/AuthContext.tsx:61-65` の `onAuthStateChange` はトークン失効時に `setUser(null)` するため、**入力中にモーダルが予告なく消える**。入力は失われ、理由の説明も無い。ユーザーは「自分で閉じてしまった」と誤解する。

`PostForm` 側は `submitPost` が `t('postForm.loginRequired')` を提示するので、ここでも方針が不統一である。

### 問題D: 投稿フォームの地図が ErrorBoundary で隔離されていない — High

`src/components/features/posts/LocationSection.tsx:105-112` の `MapContainer` / `TileLayer` / `LocationPicker` は、`PostForm.tsx:301` から描画されるが**局所 ErrorBoundary で包まれていない**。

`HomePage.tsx:419` には `<ErrorBoundary context="MapView" fallback={(reset) => <MapErrorFallback onRetry={reset} />}>` があり、直前の :415-418 に「チャンクロード失敗や leaflet 描画例外を地図枠内に閉じ込め、最上位 providers.tsx の ErrorBoundary まで伝播させない」と明記されている。`Crayfish3DStage.tsx:131-136` も同方針である。**入力を保持している唯一の画面だけが未対応**という逆転が起きている。

leaflet の dynamic import のチャンク取得失敗（デプロイ直後の古いチャンク参照、モバイル回線の断続）や描画例外が `LocationSection` で発生すると、例外は `src/app/providers.tsx:110` の最上位 `<ErrorBoundary>` まで伝播し、**全画面がフォールバック（`ErrorBoundary.tsx:74-92`・`window.location.reload()` ボタンのみ）に置き換わる**。このとき投稿フォームが保持している写真 `File[]`・コメント・録音 Blob・位置がすべて失われる。

`DetailPage.tsx:620` と `SurveyRequestPage.tsx:207` の地図も未隔離だが、未送信入力を保持していないため優先度は下がる。

## 機能要件

- **FR-300-01（dirty 判定による閉じ確認）**: `PostForm` の3つの閉じる経路（背景タップ :226 / Escape :71 / × :235）に dirty 判定（`photos.length > 0 || !!audioBlob || comment.trim().length > 0 || !!position`）を挟み、dirty のときはインライン確認を出してから閉じる。確認 UI は REQ-273 FR-273-04 で調査依頼クローズに入れた確認と同型にする。**dirty 時は背景タップで閉じない**（誤タップ経路を塞ぐ）。
- **FR-300-02（草稿対象の拡張、または復元不可の明示）**: 次の (a) を基本とし、実現困難な場合は (b) を必須とする。
  - (a) `usePostDraft` の保存対象に写真・音声を含める（`localStorage` は容量・型の制約があるため IndexedDB への移設を含めて検討。既存の `useOfflineQueue` が IndexedDB へ Blob を永続化しているので同方式が使える）。
  - (b) 草稿復元バナーに「**写真・音声は復元されません**」を明示し、閉じる確認ダイアログ側にも「写真N枚・録音は破棄されます」を件数付きで表示する。**「消えたことを告知しない」状態を残さない。**
- **FR-300-03（調査依頼フォームの草稿保存）**: `SurveyRequestForm` に `usePostDraft` と同型の草稿自動保存（sessionStorage または localStorage）を追加し、再オープン時に復元バナーを出す。最低限、dirty 時の閉じ確認（FR-300-01 と同一方針）を必須とする。
- **FR-300-04（セッション切れ時の入力保持と再ログイン導線）**: `SurveyRequestForm.tsx:110` の `if (!user) return null` を廃し、`user` が null になった場合はモーダルを閉じずに「セッションが切れました」＋再ログイン導線を**モーダル内**に表示する。入力値は state に保持し、再ログイン後にそのまま送信できる。文言は `PostForm` の `postForm.loginRequired` と整合させる。
- **FR-300-05（投稿フォーム地図の局所 ErrorBoundary）**: `LocationSection.tsx:105-112` の地図区画を `HomePage.tsx:419` と同型の `<ErrorBoundary context="post-location-map" fallback={…}>` で包む。fallback は地図枠と同寸で、「地図を読み込めません（座標は手入力/再試行できます）」＋再試行ボタン（`reset` を呼び MapContainer を再マウント）とする。**フォーム本体・写真・録音・コメントは生存させる。**
- **FR-300-06（他画面の地図隔離・優先度低）**: `DetailPage.tsx:620` と `SurveyRequestPage.tsx:207` の地図も同型の局所 ErrorBoundary で包む。未送信入力を持たないため FR-300-05 の後で対応してよい。
- **FR-300-07（回帰テスト）**: (a) dirty 状態で背景タップ/Escape/× のいずれでも即閉じしないこと、(b) `SurveyRequestForm` で `user` が null になってもアンマウントせず再ログイン導線を出すこと、(c) `LocationSection` 内で例外を throw させても `PostForm` のコメント入力が DOM に残ること、をテストで固定化する。

## 受入基準

- **AC-01**: 写真を選択し録音してコメントを入力した状態で、背景タップ・Escape・× のいずれを行っても即座には閉じず、破棄の確認が出る。確認をキャンセルすると入力（写真・音声含む）が保持されている。
- **AC-02**: FR-300-02 (a) を実装した場合、フォームを閉じて再度開くと写真と音声が復元される。(b) の場合、復元バナーと確認ダイアログの双方に「写真・音声は復元されない」旨が明示されている。**復元されないのに告知が無い状態が存在しない。**
- **AC-03**: 調査依頼フォームで調査理由を入力後に誤って閉じても、再度開いたときに入力が復元される（または閉じる前に確認が出る）。
- **AC-04**: 調査依頼フォーム入力中にセッションが失効しても、モーダルはアンマウントされず、理由の説明と再ログイン導線が表示され、入力値が保持されている。
- **AC-05**: 投稿フォームの地図描画で例外を発生させても、フォールバックは地図枠内に限定され、写真・コメント・録音・位置の入力が失われない。最上位の全画面フォールバックへ遷移しない。
- **AC-06**: 追加した i18n キーが ja/en/ko/zh 4言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-07**: `lint` / `type-check` / 既存652テストがパスする。

## 備考（要確認）

- FR-300-02 (a) の写真・音声の草稿保存先は**要確認**。`localStorage` は文字列のみ・容量数MBのため写真3枚＋録音では容量を超える可能性が高く、IndexedDB（`useOfflineQueue` と同方式）が現実的だが、既存のオフラインキュー（REQ-185）と保存領域・削除タイミングの責務分担を決める必要がある。
- FR-300-04 で「再ログイン後にそのまま送信」を実現する際、再ログインを同一モーダル内で行うか `AuthModal` を重ねるかは**要確認**（後者はフォーカストラップの入れ子になる）。
- 監査では `PostForm` の `beforeunload`（:128-134）が有効であることは確認済み。本 REQ はこれを置き換えるものではなく、モーダル閉じ経路を追加で塞ぐものである。
