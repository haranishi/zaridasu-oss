## SEO-003: ドメイン・Canonical 統一

### 背景

`index.html` の canonical と OGP URL が `https://zaridasu.com/` を指しているが、実際のサービスは `https://zaridasu.vercel.app/` で動作している場合がある。

Googleは2つのURLを別々のページとして認識するため、PageRank が分散する。

### ユーザーストーリー

```
As a サービス管理者,
I want to すべてのページで canonical URL が統一されてほしい,
So that Googleが重複コンテンツとして評価せず、PageRank が集約される。

受け入れ条件:
- [ ] 本番ドメインを1つに決定する（zaridasu.com を推奨）
- [ ] VITE_APP_URL 環境変数を正しく設定する
- [ ] zaridasu.vercel.app → zaridasu.com にリダイレクトが設定される
- [ ] index.html / PageSEO の canonical が統一ドメインを使用する
```

### 実装設計

#### Vercel でのカスタムドメイン設定

```
1. Vercel Dashboard → Settings → Domains
2. zaridasu.com を追加
3. DNS プロバイダーで CNAME or A レコードを設定
4. zaridasu.vercel.app → zaridasu.com にリダイレクト（Vercel が自動設定）
```

#### 環境変数の統一

```bash
# Vercel 環境変数（本番）
VITE_APP_URL=https://zaridasu.com

# .env.local（開発）
VITE_APP_URL=http://localhost:5173
```

#### constants.js の BASE_URL 確認

```javascript
// 現状
export const BASE_URL = import.meta.env.VITE_APP_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'https://zaridasu.com')
// → VITE_APP_URL が設定されていれば自動的に統一される（変更不要）
```

---

