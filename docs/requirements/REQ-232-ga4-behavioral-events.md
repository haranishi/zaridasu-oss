# REQ-232: GA4 行動イベント設計（投稿ファネル/エンゲージ/地図/調査依頼の計測とキーイベント化）

## これは何か

市民科学の参加ファネル（閲覧→投稿→エンゲージ→能動的依頼）を GA4 で測れるようにするための
行動イベント設計と計測仕様書（tracking plan）。詳細は
`REQ-232-ga4-behavioral-events/` 配下に分割している。

## 目的・背景（要約）

GTM 経由の GA4 は導入済みで、LP・Web Vitals・認証のイベントだけが実装されている。一方
**参加ファネルの中核である行動イベントは一切計測されていない**（投稿・地図操作・ギャラリー閲覧・
調査依頼・いいね・コメント・通報のいずれも `dataLayer.push` を持たない）。`page_view` だけでは
卒研 KPI（参加率・投稿転換率・エンゲージ率）を測れないため、行動イベント体系を設計・実装する。
下敷きは Obsidian の「GA4設定とコンバージョン設定 実務ガイド」。

## 主要な決定事項（要点）

- **計測経路は GTM/dataLayer の 1 経路を維持**。`@next/third-parties` の `sendGAEvent` への全面移行は
  二重計上リスクがあるため別 REQ に切り出す。
- LP 専用の `pushLpEvent` を一般化し、`src/lib/analytics.ts` に汎用 `trackEvent` を新設。
  SSR ガード / production ガード / `dataLayer` 初期化を一元化し、`window.dataLayer` の型宣言も一本化する。
- **`page_view` は手動送出しない**（拡張計測に委ねる）＝二重計上の最頻出原因を作らない。
- **PII を送らない**: 位置の生値・メール・個人名・自由記述は不可。confidence はバケット化、
  `post_id` 等の高カーディナリティ識別子は標準では送らない。
- **キーイベント化は `post_success` / `survey_request_submit` / `sign_up`**。カウント方法は「イベントごと」。
  確定後のリネームは指定外れ事故を招くため禁止。
- 高頻度イベント（`map_interact` / `gallery_view`）はデバウンス・間引き必須。
- 既存イベント（`lp_*` / `web_vital` / `sign_up` / `login` / `sign_up_initiated`）は**名前・パラメータ・発火条件を変えない**。
- カスタムパラメータは GA4 でカスタムディメンション登録しないとレポートに出ないため、登録手順をチェックリスト化する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-232-ga4-behavioral-events/01-background.md) | 背景（現行の実装済みイベント棚卸しと、実務ガイドから引く前提知識） |
| [02-current-problems.md](REQ-232-ga4-behavioral-events/02-current-problems.md) | 現状の問題 1〜6（LP 専用ユーティリティ・投稿ファネル・エンゲージ・地図/検索・調査依頼・台帳の不在） |
| [03-goals-and-functional-requirements.md](REQ-232-ga4-behavioral-events/03-goals-and-functional-requirements.md) | 目的と機能要件 FR-232-01〜09（trackEvent 新設・各ファネルの計測箇所とパラメータ・台帳化・キーイベント化） |
| [04-non-functional-requirements.md](REQ-232-ga4-behavioral-events/04-non-functional-requirements.md) | 非機能要件 NFR-232-01〜05（二重計上禁止・PII 非送出・イベント量抑制・環境ガード・回帰ゼロ） |
| [05-acceptance.md](REQ-232-ga4-behavioral-events/05-acceptance.md) | 受入条件 AC-01〜09 |
| [06-impact.md](REQ-232-ga4-behavioral-events/06-impact.md) | 影響範囲（担う範囲のファイル一覧／REQ-033・107・176・233 との境界／他機能への影響リスク） |
| [07-tracking-plan.md](REQ-232-ga4-behavioral-events/07-tracking-plan.md) | 計測仕様書テンプレ: 全イベントの発火箇所・パラメータ・PII 有無・キーイベント・CD 要否の表 |
| [08-priority.md](REQ-232-ga4-behavioral-events/08-priority.md) | 優先度（緊急度 Medium / 重要度 High）とその理由 |
