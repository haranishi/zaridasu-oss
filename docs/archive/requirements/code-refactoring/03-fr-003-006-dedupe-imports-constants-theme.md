### FR-003: 重複コードの共通化

#### FR-003a: フォーカストラップ統一
- **現状:** PostForm.tsx, EditDialog.tsx, DeleteDialog.tsx に各々実装
- **対処:** `src/hooks/useFocusTrap.ts` を作成し3箇所から参照
- **インターフェース:**
  ```typescript
  function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean): void
  ```

#### FR-003b: 天気アイコンマップ統一
- **現状:** PostForm.tsx (L19-27) と DetailPage.tsx (L41-49) に重複定義
- **対処:** `src/lib/weatherIcons.tsx` に集約
  ```typescript
  export const WEATHER_ICONS: Record<string, React.ReactNode> = { ... }
  ```

#### FR-003c: 日付ロケールマップ統一
- **現状:** MapView.tsx, PostCard.tsx, DetailPage.tsx に各々定義
- **対処:** `src/lib/dateLocales.ts` に集約
  ```typescript
  export const DATE_LOCALES: Record<string, Locale> = { ja, en: enUS, zh: zhCN, ko }
  ```

### FR-004: インポートパスの統一
- **説明:** 全ファイルの相対パス `../` を `@/` エイリアスに変換
- **対象範囲:**
  - `src/context/` 内のファイル
  - `src/views/` 内のファイル
  - `src/components/` 内のファイル
  - `src/hooks/` 内のファイル
- **ルール:** 同一ディレクトリ内の `./` は許容、`../` は `@/` に統一

### FR-005: 定数ファイルの分割
- **現状:** `src/lib/constants.ts` が232行で複数の責務を持つ
- **分割先:**
  ```
  src/lib/constants/
  ├── index.ts          # barrel export
  ├── geography.ts      # MUNICIPALITIES, MUNICIPALITY_DATA, AKITA_CENTER, AKITA_BOUNDS
  ├── species.ts        # SPECIES, INFO_TYPES, SURVEY_SPECIES
  ├── map.ts            # MAP_LAYERS, MAP_LAYER_STORAGE_KEY, HEATMAP_CONFIG
  ├── validation.ts     # MAX_PHOTOS, MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, etc.
  └── badges.ts         # BADGES
  ```
- **barrel export:** 既存の `import { ... } from '@/lib/constants'` が壊れないよう `index.ts` で全re-export

### FR-006: テーマクラスヘルパーの統一適用
- **説明:** `src/lib/themeClasses.ts` のヘルパー関数を全コンポーネントで使用する
- **対象:** インラインで `dark ? 'bg-slate-950' : 'bg-gray-50'` 等のパターンがある全ファイル（131箇所以上）
- **既存ヘルパー:** `pageBg`, `cardCls`, `heading`, `muted`, `divider`, `faint`
- **追加ヘルパー（必要に応じて）:**
  ```typescript
  export const headerBg = (dark: boolean) => dark ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80' : 'bg-white/95 backdrop-blur-md border-gray-200'
  export const linkCls = (dark: boolean) => dark ? 'text-slate-400 hover:text-red-400' : 'text-gray-500 hover:text-red-600'
  ```

---

