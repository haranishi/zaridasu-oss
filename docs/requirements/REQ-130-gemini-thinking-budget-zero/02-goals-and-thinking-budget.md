## 目的

1. **Gemini 2.5 Flash の thinking が maxOutputTokens を消費しないように設定**して、analyze-audio / analyze-image を確実に成功させる
2. **出力構造を schema で強制**して、出力 token 上限を予測可能にする
3. **エラー時の usage 情報を保持**してデバッグ可能性を高める
4. **retry を 2 回に拡張**して thinking 以外の真の MAX_TOKENS にも耐えるようにする

## 要件

### 機能要件

#### A. thinkingBudget 制御

- [ ] **FR-130-01: `thinkingConfig` を generationConfig に追加**
  `analyze-audio/index.ts:188-190` / `analyze-image/index.ts:358` / `health-gemini/index.ts:83` の `generationConfig` を:
  ```ts
  generationConfig: {
    responseMimeType: 'application/json',  // analyze-image にも追加（後述 FR-130-02 と組み合わせ）
    maxOutputTokens: getMaxOutputTokens(),
    thinkingConfig: {
      thinkingBudget: getThinkingBudget(),  // env から取得、default 0
    },
    temperature: 0.1,
  }
  ```

- [ ] **FR-130-02: `getThinkingBudget()` ヘルパ**
  `_shared/aiLogging.ts` か新規 `_shared/geminiConfig.ts` に:
  ```ts
  export function getThinkingBudget(): number {
    const raw = Deno.env.get('GEMINI_THINKING_BUDGET')
    if (raw === undefined) return 0  // 既定で thinking 無効
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  ```
  - default `0` (thinking 完全無効)
  - env `GEMINI_THINKING_BUDGET=128` 等で部分的に有効化も可

- [ ] **FR-130-03: `.env.example` に `GEMINI_THINKING_BUDGET` を追加**
  Edge Function セクションに:
  ```
  # GEMINI_THINKING_BUDGET=0  # 0 = thinking 無効 (推奨)。128 程度なら推論精度向上
  ```
