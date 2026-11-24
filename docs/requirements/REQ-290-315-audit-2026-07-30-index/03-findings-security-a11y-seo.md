## 観点別の主要発見（要約）

### セキュリティ（6件: High 3 / Medium 1 / Low 2）

- `.claude/settings.local.json` に **Supabase Personal Access Token 3種・Gemini APIキー 2種・JWT 2種**（本番anon JWT含む）が平文で残存。無視しているのは**ユーザーのグローバル gitignore のみ**で、リポジトリの `.gitignore` に `.claude` の記載がない（現在は未追跡＝コミット済み漏洩ではないが、別クローン・別マシンでは `git add -A` で即コミットされる）。docs 側は REQ-017 で伏字化済みのため**どのトークンが失効済みか台帳から判別できず**、失効runbookの終了条件も全項目が未チェック（REQ-290）
- Vault に `webhook_secret` が未登録のため `_shared/webhookAuth.ts` の grace period が常時成立し、**webhook系 Edge Function 12本が公開anonキーだけで到達可能**。到達するとメール爆撃・ライフサイクルメール一斉送信・Gemini課金消費・SNS強制投稿が可能で、失敗時は `error: String(e)` で内部エラー文字列も返る。REQ-270 でコードは入ったが値の供給が未完（REQ-291）
- `admin_login_record` が anon に GRANT され、`p_success: true` を1回投げるだけで管理者ログインのロックアウトを自己解除できる。さらに `signInWithPassword` 直叩きのブルートフォースでは記録関数が呼ばれないため**サーバー側ロックが一度も発火しない**。SECURITY DEFINER が `audit_logs` の admin 限定 INSERT ポリシーをバイパスするため監査ログの偽造・無制限膨張も可能（REQ-292）
- `check_email_exists` の anon GRANT によるメール存在確認オラクル。受容根拠として記録された Turnstile と Auth レート制限が、**RPC 直叩き経路にはどちらも掛からない**（REQ-292）
- クリーン確認: middleware認可・RLS本体（24テーブル全てENABLE）・SECURITY DEFINERのsearch_path・XSS（JSON-LDはsafeJsonLd経由）・オープンリダイレクト・CSPとセキュリティヘッダ・環境変数露出・Storageポリシー・REQ-287のservice-role集約・REQ-242の所有者チェック。**2026-07-17以降の新規テーブルは存在せず**、REQ-289はクライアント側定数とURL builderのみ

### アクセシビリティ（15件: Critical 1 / High 4 / Medium 8 / Low 2）

- **投稿・調査依頼の位置選択が地図クリック専用**。`useMapEvents({ click })` のみで、Leafletのキーボード操作は click を発火しない。位置は必須ガードのため**キーボード/スクリーンリーダー利用者は投稿を完了できない**（WCAG 2.1.1失敗）。自動geolocationは「権限許可済み」かつ「物理的に秋田県内」でしか救済にならず、県外・GPS拒否・デスクトップでは常に未設定。調査依頼フォームはgeolocationフォールバック自体が無い（REQ-294）
- `DrawerMenu` が閉状態でもDOMに残り、20以上のコントロールがタブ順に残る。`aria-modal="true"` が常時出ているため、これを尊重するATでは背景が常に無視される可能性（REQ-302）
- `useFocusTrap` がフォーカス復帰しないため、**全11モーダル共通で**閉じるたびにフォーカスが body に戻る（WCAG 2.4.3）（REQ-302）
- フォームコントロール**19個**にプログラム的ラベルがない。同リポ内に正しい実装（`htmlFor`/`id`、`role="group" aria-labelledby`）が存在する非対称（REQ-302）
- 原因は構造的: `eslint.config.js` で **jsx-a11y が3ルールしか有効化されておらず**、import 済みの `recommended` が spread されていない。`label-has-associated-control` 等が全てオフでCIが退行を止められない（REQ-302）
- ダークモードのplaceholderが **1.93:1**（共有入力スタイル `formStyles.ts` 経由で全入力に波及）。placeholderは装飾ではなく入力指示を担うためWCAG 1.4.3対象。`text-gray-400`（白地2.54:1）も**185箇所**残存し、BottomNavだけ修正済みという移行未完（REQ-303）
- a11y文言の日本語ハードコード**17箇所**。`html lang` が en/zh/ko に切り替わるため、**スクリーンリーダーが英語音声で日本語を読もうとする**（REQ-304）
- クリーン確認: 3D図鑑（role="img"＋操作説明＋reducedMotion）、音声プレイヤー（role="slider"＋キーボード操作完備）、画像alt（欠落0件）、スキップリンク、tabIndex誤用なし、地図マーカーのkeyboard={false}は代替経路つきの設計判断、エラー通知のrole="alert"＋フォーカス移動、カラートークン設計（実測コントラスト比コメント付き）、ズーム禁止の回避

### SEO（6件: High 1 / Medium 2 / Low 3）

- indexableな静的ページ**7本**が `og:url` / `og:title` を親から継承し、**og:url が全て `/` になる**（/trends・/ranking・/area・/about・/terms・/privacy・/dataset）。Next.js の metadata はページの `title` から `openGraph` を自動補完しないため、SNS共有時のカードのタイトル・説明・リンク先が全てホームのものになる。**プロジェクト自身が既にこの欠陥を認識しており** `requests/page.tsx` には「REQ-275 FR-275-02: og:url も親の '/' を継承していたため明示する」とコメント付きで修正済み＝他7ページに未展開（REQ-312）
- twitterカードが**8ページ**で親継承。ルートに `twitter` ブロックが明示定義されているため、ページ側未定義では **og:* からのフォールバックが行われない**（REQ-312）
- 位置非公開（`location_disclosure='hidden'`）の投稿のJSON-LDが **geo 0,0（ギニア湾）を出力**。`display_lat` が NULL になる設計に対し `Number(null)===0` で通ってしまう。**サーバー側 `src/lib/seo.ts:110-111` とクライアント側 `src/hooks/useDetailSEO.ts:103-104` の2箇所に同型で存在**し、両方直さないと片方に残る（`DetailPage.tsx:603-604` は `post.lat != null ? Number(post.lat) : null` と正しくガードしている対比あり）。研究データとして配布・引用される構造化データに明確な誤座標が入る（REQ-310）
- 4言語UIに対して hreflang / ローカライズURLが存在せず、**en/zh/ko の翻訳コンテンツに固有URLがないため検索エンジンがインデックスできない**＝4言語分の翻訳コストが検索流入に一切結びついていない（REQ-312。ただし `/[locale]` 導入は工数が大きくプロダクト判断が必要な項目として分離）
- 管理画面11ページが metadata 未定義でルートの `robots:{index:true}` を継承（robots.txt でクロールは止まるがインデックス禁止の保証ではない）。`/admin/login` だけ noindex を持つ不揃い（REQ-312）
- クリーン確認: sitemap×robots×canonical の整合（**REQ-275 で修正した /privacy・/terms の矛盾は再発なし**）、canonical の網羅、動的ページの `generateMetadata` 全実装、404の noindex、JSON-LD の `@graph` 構造と `safeJsonLd` によるスクリプト注入防止、sitemap の堅牢性、h1 の網羅（**REQ-275 の修正が退行していない**）
