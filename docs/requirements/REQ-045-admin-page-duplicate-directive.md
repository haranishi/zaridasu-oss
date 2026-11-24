# REQ-045: admin page.tsx と AdminDashboard の 'use client' 重複整理

## 背景
Next.js 15 App Router では、Server Component から Client Component を import する際、Client Component 側で `'use client'` を宣言していれば十分である。ラッパー（`app/.../page.tsx`）側に `'use client'` を付ける必要はなく、むしろ混在すると意図が読み取りづらくなる。本プロジェクトでは `src/app/admin/page.tsx` と `src/views/admin/AdminDashboard.tsx` の両方に `'use client'` が宣言されており、一貫性に欠けている。

## 現状の問題
- `src/app/admin/page.tsx:1-3` で `'use client'` が宣言され、実体は単なる re-export：
  ```tsx
  'use client'

  export { default } from '@/views/admin/AdminDashboard'
  ```
- `src/views/admin/AdminDashboard.tsx:1` で同じく `'use client'` が宣言されている：
  ```tsx
  'use client'

  import Link from 'next/link'
  ```
- 比較: `src/app/dashboard/page.tsx` は `DashboardPageClient.tsx` 経由で構成されており、admin と命名規則・構成パターンが揃っていない（admin は View を直接 re-export、dashboard は Client ラッパーを経由）。
- `src/app/admin/layout.tsx:1-15` は `AdminLayoutClient` 経由で Client Component を組み立てており、`'use client'` は付いていない（正しいパターン）。page.tsx だけが二重指定になっている。

## 目的
`'use client'` の宣言位置を単一化し、App Router 配下の `page.tsx` / View の役割分担を一貫させる。

## 要件
### 機能要件
- [ ] FR-045-01: `src/views/admin/AdminDashboard.tsx` の先頭 `'use client'` を維持（Client Component の実体であることを明示）。
- [ ] FR-045-02: `src/app/admin/page.tsx` から `'use client'` を削除し、次の 1 行のみ残す：
  ```tsx
  export { default } from '@/views/admin/AdminDashboard'
  ```
- [ ] FR-045-03: 同様の重複が他の `src/app/admin/**/page.tsx`（`posts`, `comments`, `users`, `reports`, `logs`, `login`）にも存在しないか確認し、あれば同じ方針で整理する。
- [ ] FR-045-04: dashboard 側の `DashboardPageClient.tsx` 経由パターンとの差異を把握したうえで、admin 側は「View を直接 re-export」方針に統一する（どちらに揃えるか ADR コメントで明記）。

### 非機能要件
- [ ] NFR-045-01: 変更後も `/admin` のハイドレーション・ルーティング動作に回帰がない。

## 受入条件
- [ ] AC-01: `npm run build` が成功する。
- [ ] AC-02: ブラウザで `/admin` にアクセスし、ダッシュボードが従来どおり描画される。
- [ ] AC-03: `grep -rn "'use client'" src/app/admin` の結果が、整理方針（page.tsx 側からは削除）と一致する。
- [ ] AC-04: `npm run type-check` / `npm run lint` ともに警告増なし。

## 影響範囲
- `src/app/admin/page.tsx`
- 必要に応じて `src/app/admin/*/page.tsx`
- 挙動に変化がないことを目視確認

## 優先度
- **緊急度**: Low
- **重要度**: Low
- **理由**: 機能的な不具合はないが、命名・構成の一貫性はメンテナビリティに寄与するため、低優先で整理する価値がある。
