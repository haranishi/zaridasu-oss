## 再開時のコマンド

```bash
cd /path/to/zaridasu
git status                    # 未コミット変更の全体像（約147件）
npm run type-check && npm run lint && npm run i18n:check
npm run test:coverage         # 閾値 60/47/51/63 を満たすはず
npm audit --omit=dev          # 0件のはず
rm -rf .next && npm run build # .next が壊れていたら消してから
npm run size && npm run size:routes   # REQ-306 のバンドル予算ゲート

# Edge Function の型ゲート（REQ-297）
deno check --lock=supabase/functions/deno.lock $(find supabase/functions -name '*.ts')

# Lighthouse（任意・数分かかる）
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx --yes @lhci/cli@0.14 autorun
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx --yes @lhci/cli@0.14 autorun --config=.lighthouserc.mobile.json
```
