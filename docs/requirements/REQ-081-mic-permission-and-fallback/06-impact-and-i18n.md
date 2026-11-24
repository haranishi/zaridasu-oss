## 影響範囲

### コード変更
| ファイル | 変更内容 |
|---|---|
| `next.config.ts` | Permissions-Policy: `microphone=(self)` |
| `src/components/features/posts/AudioRecorder.tsx` | 権限チェックフロー強化、エラー UI 詳細化、自動フォールバック |
| `src/lib/audio/permission.ts`（新規） | Permissions API ラッパ + UA 判定 |
| `src/lib/audio/inAppBrowser.ts`（新規） | LINE/X/Instagram/Facebook UA 判定 |
| `src/components/features/posts/MicPermissionGuide.tsx`（新規） | OS 別手順モーダル |
| `src/locales/{ja,en,ko,zh}/translation.json` | エラー文言・OS 別手順を i18n 化 |
| `src/components/features/posts/__tests__/AudioRecorder.test.tsx`（新規） | 単体テスト |

### i18n 追加（抜粋）
- `audio.permission.denied`
- `audio.permission.notFound`
- `audio.permission.notReadable`
- `audio.permission.overconstrained`
- `audio.permission.security`
- `audio.permission.guideTitle`
- `audio.permission.guideSafariIos`, `guideChromeAndroid`, `guideSafariMacos`, `guideGeneric`
- `audio.permission.inAppBrowser`
- `audio.permission.openInBrowser`

---
