## 非機能要件

### パフォーマンス
- ボタン追加によるレンダリングコストは無視できる（`<a>` 1 個追加）
- バンドル増は ~1KB 未満
- 既存の Lighthouse / Web Vitals に影響しない

### セキュリティ
- `target="_blank"` には必ず `rel="noopener noreferrer"` を付け、`window.opener` 経由のフィッシングを防止
- 座標値以外の文字列を URL に含めない（XSS / Open Redirect の余地なし）
- 緯度経度は **小数 6 桁に丸めてから** URL に渡す（既存ポリシーと整合: 厳密な位置を外部に渡しすぎない）
- Google Maps への遷移は外部リンクのため、ザリダスの認証情報は一切送られない（cookies / referrer policy に noreferrer 指定済み）

### 可用性・信頼性
- Google Maps の URL スキームは公開仕様（[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)）。安定運用されている
- Google Maps 側がメンテで落ちている場合でも、ザリダス本体には影響なし（リンクが一時的に開けないだけ）
- アプリインストール有無の判定は OS に委譲（自前判定は不要）

### アクセシビリティ（WCAG 2.1 AA 準拠）
- **2.4.4 リンクの目的（コンテキスト内）**: `aria-label` で外部遷移を明示
- **3.2.5 利用者の要求による変化**: 外部リンクであることを `↗` アイコンや「（新しいタブで開く）」テキストで予告
- **1.4.3 コントラスト比**: ボタンの背景色とテキストのコントラストは 4.5:1 以上
- **2.1.1 キーボード操作**: `<a>` 要素なので Tab で到達、Enter で発火（標準挙動）
- **2.4.7 フォーカスの可視化**: `focus-visible:ring-2 focus-visible:ring-amber-400` 相当を付与
- **2.5.5 ターゲットサイズ**: 高さ 40px 以上推奨

### レスポンシブ対応
- モバイル（< 640px）: フル幅または `inline-flex` でも自然に収まる小さめボタン
- タブレット / PC（≥ 640px）: `inline-flex` で右寄せ or 左寄せ。地図カードに自然に並ぶ

---
