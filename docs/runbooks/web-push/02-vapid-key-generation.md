## 2. VAPID 鍵ペアの生成（最重要）

VAPID 鍵は **base64url の raw P-256**（公開鍵 65 byte / 秘密鍵スカラ 32 byte）。
`_shared/webpush.ts` はこのフォーマットを前提にしている。以下のいずれかで生成する。

### 方法 A: web-push CLI（最も簡単）

```bash
npx web-push generate-vapid-keys
# 出力例:
#   Public Key:  BNc...（base64url・65 byte 相当）
#   Private Key: kYx...（base64url・32 byte 相当）
```

- `Public Key`  → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`（クライアント）と `VAPID_PUBLIC_KEY`（Edge）に**同じ値**を設定。
- `Private Key` → `VAPID_PRIVATE_KEY`（Edge Secrets のみ）。

### 方法 B: openssl + 変換（CLI を入れたくない場合）

```bash
# P-256 秘密鍵を生成
openssl ecparam -genkey -name prime256v1 -noout -out vapid_private.pem
# 公開鍵（uncompressed point, 65 byte）を base64url 化
openssl ec -in vapid_private.pem -pubout -outform DER 2>/dev/null \
  | tail -c 65 | basenc --base64url | tr -d '='
# 秘密鍵スカラ（32 byte の d）を base64url 化
openssl ec -in vapid_private.pem -outform DER 2>/dev/null \
  | tail -c +8 | head -c 32 | basenc --base64url | tr -d '='
```

> 生成した `vapid_private.pem` / 出力した秘密鍵は **安全に保管し、リポジトリに置かない**。

### 鍵が正しいかの確認

`supabase/functions/_shared/__tests__/webpush.test.ts` が VAPID JWT（ES256）の構造・aes128gcm
暗号化・失効ハンドリングを検証する。鍵フォーマットの実装契約はこのテストが担保している。

```bash
deno test --allow-env --allow-net --allow-read --no-check \
  supabase/functions/_shared/__tests__/webpush.test.ts
```

---
