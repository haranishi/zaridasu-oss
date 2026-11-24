# REQ-017: 機密情報のローテーションとgit履歴クリーンアップ

## 背景
セキュリティ監査により、`.env.local` および `supabase/functions/.env` にAPIキー等の機密情報が平文で保存されていることが判明。これらがgit履歴に含まれている場合、リポジトリにアクセスできる全員が秘密鍵を取得可能であり、不正アクセスやAPI悪用のリスクがある。

## 現状の問題
- `.env.local` に Supabase Anon Key（JWT）が平文保存されている
- `.env.local` に Gemini API Key が平文保存されている
- `supabase/functions/.env` にも Gemini API Key が平文保存されている
- Supabase Project URL が露出している
- これらのファイルがgitの追跡対象またはgit履歴に含まれている可能性がある

## 目的
全ての機密情報をローテーション（再生成）し、git履歴から完全に除去することで、情報漏洩リスクをゼロにする。

## 要件

### 機能要件
- [ ] FR-017-01: Supabase Anon Key を Supabase ダッシュボードで再生成する
- [ ] FR-017-02: Gemini API Key を Google Cloud Console で再生成する
- [ ] FR-017-03: Vercel の環境変数を新しいキーで更新する
- [ ] FR-017-04: `.env.local`, `supabase/functions/.env` が `.gitignore` に含まれていることを確認する
- [ ] FR-017-05: git履歴から `.env.local`, `supabase/functions/.env` を `git filter-repo` 等で除去する
- [ ] FR-017-06: `.env.example` を作成し、必要な環境変数名のみ（値なし）を記載する

### 非機能要件
- [ ] NFR-017-01: CI/CDパイプラインにシークレットスキャン（例: gitleaks）を導入し、今後のコミットで秘密鍵が混入しないようにする

## 受入条件
- [ ] AC-01: `.env.local` と `supabase/functions/.env` が `.gitignore` に含まれている
- [ ] AC-02: `git log --all -p -- .env.local` で機密情報がヒットしない
- [ ] AC-03: 旧APIキーでのAPI呼び出しが失敗する（ローテーション済み）
- [ ] AC-04: 新キーでアプリが正常に動作する（Vercel デプロイ確認）
- [ ] AC-05: `.env.example` が存在し、必要な環境変数名が記載されている

## 影響範囲
- `.gitignore`
- Vercel 環境変数設定
- Supabase ダッシュボード設定
- Google Cloud Console 設定
- CI/CD 設定（シークレットスキャン追加時）

## 優先度
- **緊急度**: Critical
- **重要度**: Critical
- **理由**: 機密情報の漏洩は不正アクセスに直結する。即座に対応が必要
