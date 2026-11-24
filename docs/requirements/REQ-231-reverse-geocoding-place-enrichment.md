# REQ-231: 逆ジオコーディングによる地名・水系・水辺フラグの付与（データ品質＋地名SEO）

## これは何か

投稿の `lat`/`lng` から**字レベル地名・近傍水系名・水辺フラグ（＋任意で標高）**を付与して `posts` に永続化し、データ品質と地名ロングテール SEO の素材にする要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

現状の逆ジオコーディングは Nominatim のレスポンスから**「市区町村名 1 個だけ」を取り出して残りを捨てている**。外来生物の分布は水系・水辺と不可分で、eDNA 研究では「どの水系・どの止水/流水か」が観測の核心的メタデータになる。字・水系・水辺フラグが無いことは、データ品質（研究利用・外れ値検知）と地名 SEO・地域ページ情報密度の両面で機会損失。

## 主要な決定事項の要点

- **当初メモの前提が誤りだったことを実コードで確認済み** — 市区町村判定は PostGIS の境界ポリゴン（`ST_Contains` 等）ではなく、**クライアント側 Nominatim → 固定 25 件リストへの文字列マッチ**。`supabase` 全体に PostGIS 境界判定は 0 件、`municipality` は単なる `TEXT` 列。
- **Nominatim の利用規約が設計の中核制約** — 絶対上限 1req/秒、識別可能な User-Agent 必須、キャッシュ推奨、bulk/systematic 利用は公開サーバで禁止。現状は**ブラウザ fetch で UA を設定できず規約を満たせていない可能性が高く**、呼び出しがクライアント分散のため合算上限も担保できない。
- したがって **サーバー側集約（Edge Function `enrich-place`）＋スロットリング＋DB 永続キャッシュ**を基本構成とする。商用・高頻度時は **OpenCage / Geoapify（apiKey）へ切替・フォールバック**できるようプロバイダを抽象化する。
- **標高（Open Topo Data）は CORS 不可なのでサーバー側からしか呼べない**。
- **既存の市区町村判定は置き換えず維持・補完**する。本 REQ は追加付与に集中。
- 付与は **非同期（投稿レスポンスをブロックしない）**、**fail-open**（失敗・タイムアウト・kill switch でも投稿は成功し列は NULL）。AI 解析の pg_net → Edge Function パターンに倣い、`geo_enriched_at` で冪等にスキップする。
- 追加列はすべて **NULL 許容**（`locality` / `water_body` / `is_on_water` / `elevation_m` / `geo_enriched_at` / `geo_source`）。
- **役割分担（重複回避）** — 地名の**産出元が本 REQ**、提示は REQ-227/228（SEO 本文・内部リンク）と REQ-229（JSON-LD）。コスト予算・kill switch の運用基盤は REQ-218、入口の bot/頻度制限は REQ-212。eDNA データ自体の取り込み・解析は将来 REQ。
- 品質チェック（水生種なのに陸・`municipality` の矛盾）は**フラグ/可視化まで。自動却下はしない**。
- 定点サイト（`survey_sites`）への拡張 FR-231-07 は**任意**。最小スコープは `posts` への付与（FR-231-01〜06）。
- 優先度は**緊急度 Low / 重要度 Medium**。市区町村単位で現状は機能しており致命的ではないが、研究価値と集客の双方に効く。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-231-reverse-geocoding-place-enrichment/01-background.md) | 背景 — 当初メモの誤りの訂正、候補 API 5 種（Nominatim / OnWater / Open Topo Data / OpenCage / Geoapify）、Nominatim 利用規約、隣接 REQ との境界 |
| [02-current-problems.md](REQ-231-reverse-geocoding-place-enrichment/02-current-problems.md) | 現状の問題 1〜6（行番号付き）— 情報の切り捨て、端末ローカルキャッシュのみ、列の不在、地名表現の情報密度、サーバー基盤の不在、品質チェック未活用 |
| [03-goals-and-functional-requirements.md](REQ-231-reverse-geocoding-place-enrichment/03-goals-and-functional-requirements.md) | 目的 5 点と機能要件 FR-231-01〜08（列追加、Edge Function、非同期トリガ、DB キャッシュ、フォールバック、提示への反映、定点サイト、品質チェック） |
| [04-non-functional-requirements.md](REQ-231-reverse-geocoding-place-enrichment/04-non-functional-requirements.md) | 非機能要件 NFR-231-01〜08（規約厳守、暴走防止、入口制限、フェイルセーフ、秘密値、座標粒度、冪等、型・テスト） |
| [05-acceptance-criteria.md](REQ-231-reverse-geocoding-place-enrichment/05-acceptance-criteria.md) | 受入条件 AC-01〜09 |
| [06-impact-and-priority.md](REQ-231-reverse-geocoding-place-enrichment/06-impact-and-priority.md) | 影響範囲（担う範囲／担わない範囲／他機能への影響リスク）と優先度の判断理由 |
