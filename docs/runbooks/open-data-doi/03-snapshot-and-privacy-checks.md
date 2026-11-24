## 手順

### 1. スナップショットの取得

最新の承認データを固定する。**生成は本番の配布エンドポイントから取得する**（粗化・PII 除外が確実に適用された出力をそのまま使うため）。

```bash
DATE=$(date +%Y-%m-%d)
mkdir -p "snapshot-${DATE}"
curl -fsSL "https://zaridasu.com/dataset/zaridasu.csv"     -o "snapshot-${DATE}/zaridasu-${DATE}.csv"
curl -fsSL "https://zaridasu.com/dataset/zaridasu.geojson" -o "snapshot-${DATE}/zaridasu-${DATE}.geojson"
```

> ローカルから本番を叩けない場合は、本番デプロイ済みのアプリで上記 URL をブラウザ保存しても同じ（出力は同一ロジック）。**開発用の生 DB を直接 dump してはいけない**（粗化前の生座標・PII が混入する）。

### 2. 事前確認（プライバシー）— アップロード前の必須ゲート

各項目を 1 つでも満たさない場合は**アップロードを中止**し、原因（コード or データ）を直してからやり直す。

1. **生座標が無いこと（粗化の確認）**: 座標が小数第3位までに丸められているか。第4位以降に数字が残っている行が無いか。

   ```bash
   # lat_coarse / lng_coarse 列に小数第4位以降が残っていれば 1 行でもヒットする（=粗化漏れ）。ヒット 0 が正常。
   #   CSV の座標列は 11,12 番目（lat_coarse,lng_coarse）。コメント行(#)とヘッダ行は除外。
   grep -vE '^#' "snapshot-${DATE}/zaridasu-${DATE}.csv" | tail -n +2 \
     | awk -F',' 'NR>0 { if ($11 ~ /\.[0-9]{4,}/ || $12 ~ /\.[0-9]{4,}/) print }'
   ```

   GeoJSON 側も同様に確認:

   ```bash
   # coordinates 配列に小数第4位以降があればヒット。ヒット 0 が正常。
   grep -oE '\[-?[0-9]+\.[0-9]{4,}' "snapshot-${DATE}/zaridasu-${DATE}.geojson" | head
   ```

2. **PII 列が無いこと**: ヘッダに `user_id` / `email` / `reporter_ip` / `accuracy` / `comment` / `photos` が**含まれないこと**。

   ```bash
   head -n 20 "snapshot-${DATE}/zaridasu-${DATE}.csv" | grep -iE 'user_id|email|reporter_ip|accuracy|comment|photos' && echo 'NG: PII 列を検出' || echo 'OK: PII 列なし'
   grep -iE '"(user_id|email|reporter_ip|accuracy|comment|photos)"' "snapshot-${DATE}/zaridasu-${DATE}.geojson" && echo 'NG: PII プロパティを検出' || echo 'OK: PII プロパティなし'
   ```

3. **ライセンス/粗化の明記があること**: CSV 先頭コメントと GeoJSON トップレベル `properties` に `License: CC BY 4.0` と粗化精度の記載があること。

   ```bash
   head -n 6 "snapshot-${DATE}/zaridasu-${DATE}.csv"
   grep -oE '"license[_a-z]*":"[^"]*"|"coordinate_precision":"[^"]*"' "snapshot-${DATE}/zaridasu-${DATE}.geojson"
   ```

4. **目視サンプル**: CSV / GeoJSON の先頭数行を実際に開き、座標・列・件数に違和感が無いか確認する。

