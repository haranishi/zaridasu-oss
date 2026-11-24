# 変更するときの読み方

既存の機能を理解したうえで、変更する契約と確認方法を小さく決める。
開発手順は [.kiro/README](../../.kiro/README.md)、コードの置き場所は [構造規約](../project-structure-conventions.md) を正本とする。

## 変更箇所から読む

| 変えたいもの | 最初に読む | 一緒に確認する境界 |
|---|---|---|
| ページ・部品・画面状態 | [frontend](frontend.md) | Provider、遅延読込、ホーム容量、SSR |
| ログイン・初回案内 | [authentication](authentication.md) | session、callback、案内完了、未送信データ |
| 投稿の項目・写真・音声 | [map-posts](map-posts.md)、[posting-moderation](posting-moderation.md) | 検証、保存、AI、DB保護、公開列 |
| 位置の表示・公開範囲 | [authorization](authorization.md) | 正確な座標、display座標、hidden、本人RPC、データ配布 |
| 水域探索・候補の計算 | [water-geometry](water-geometry.md) | 件数不明、古い応答、Worker、ABI、生成物 |
| 調査計画・希少種 | [fieldwork](fieldwork.md) | 所有者、端末キャッシュ、再送、非公開写真 |
| 貢献レベル・図鑑・ランキング | [participation](participation.md) | DB集計、実験、公開プロフィール、訂正時の扱い |
| 審査・通報・管理画面 | [posting-moderation](posting-moderation.md)、[authorization](authorization.md) | admin、影響行数、監査、管理者専用経路 |
| 通知・AI・外部接続 | [notifications-ai](notifications-ai.md)、[external-services](external-services.md) | Edge認証、配信条件、費用制限、デプロイ |
| スキーマ・RPC | [data-model](data-model.md)、[ER図](data-model-er.md) | migration、型、RLS・GRANT、pgTAP、索引、ER図の更新 |
| PWA・未送信・キャッシュ | [offline](offline.md) | 所有者切替、認証経路の除外、SW更新、重複送信 |
| 言語・表示・検索と共有 | [localization-ui](localization-ui.md) | 4言語、フォーカス、OGP、canonical、公開URL |
| 検査・ビルド・本番手順 | [validation](validation.md)、[operations-ci](operations-ci.md) | 実行条件、CIイベント、秘密情報、DB・Edge別反映 |

## 読んでから実装する

1. [現行仕様](../current/README.md)、関連REQ、実装、テストを照合する。REQの古い状態欄だけで未実装と判断しない。
2. 何が変わり、何を維持するかを要件に書く。既存REQの継続か、小修正か、新規仕様かを振り分ける。
3. 新規仕様は要件・設計・タスクを提示し、対象段階の承認を得る。既に明示された許可は引き継ぐ。
4. 更新すべきコード、翻訳、DB、現在の仕様、テストを1つの変更範囲として確認する。
5. 変更の境界に合う検査を実施し、実行結果と未確認の範囲を残す。

## 文書が食い違ったとき

コードで現在の挙動を確認し、現在の仕様とこの案内を訂正する。
REQは過去の判断を残すため、本文を現在の形へ全面的に書き換えず、必要なら後継仕様を案内する。
仕様と実装のどちらが望ましいかを変える判断は、説明の訂正と別に扱う。

## このガイドの更新

新しいソースファイルは [ソース索引](source-map.md) の該当ページへ追加し、対応する領域の説明へ結び付ける。
ファイルを削除・移動した場合もリンクを直す。用途が変わったファイルは説明の割当も変える。
新しく書く開発文書は原則100行以内に分け、入口からたどれるようにする。
生成物・第三者テンプレート・既存の長い文書は由来を保ち、規則のためだけに内容を分解しない。
