### US-11: 重複投稿検知

```
As a 管理者,
I want to 同一地点・同一時間帯の重複投稿を自動検知したい,
So that データの品質を保てる.

受け入れ条件:
- [ ] 投稿時に時空間近接チェックを実行する
  - 条件: 同一ユーザー + 半径100m以内 + 24時間以内 + 同一種別
- [ ] 重複候補がある場合、投稿者に確認ダイアログを表示する
  - 「似た投稿があります。それでも投稿しますか？」
- [ ] DB関数で ST_DWithin（PostGIS）または Haversine 距離計算を行う
- [ ] 管理画面で重複フラグ付き投稿を一覧表示できる
```

**DB関数:**
```sql
CREATE OR REPLACE FUNCTION check_duplicate_post(
  p_user_id UUID,
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_species TEXT,
  p_observed_at TIMESTAMPTZ
) RETURNS TABLE(id UUID, lat DECIMAL, lng DECIMAL, observed_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.lat, p.lng, p.observed_at
  FROM posts p
  WHERE p.user_id = p_user_id
    AND p.species = p_species
    AND p.observed_at BETWEEN p_observed_at - INTERVAL '24 hours'
                        AND p_observed_at + INTERVAL '24 hours'
    AND (
      6371000 * acos(
        cos(radians(p_lat)) * cos(radians(p.lat)) *
        cos(radians(p.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(p.lat))
      )
    ) < 100
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**優先度: 中** | **影響度: 中** | **実装コスト: 中**

---

### US-12: 秋田県境界ポリゴン精密チェック

```
As a システム管理者,
I want to 投稿位置が秋田県内であることを精密に検証したい,
So that 県外の無関係な投稿を自動排除できる.

受け入れ条件:
- [ ] 現在の AKITA_BOUNDS（矩形バウンディングボックス）をポリゴン境界に置き換える
- [ ] GeoJSON 形式の秋田県境界データを取得する（国土地理院 or Natural Earth）
- [ ] クライアントサイドで turf.js の booleanPointInPolygon で事前チェックする
- [ ] サーバーサイドでも DB 関数で最終検証する
- [ ] 県境付近（バッファ500m）の投稿は警告表示のみで許可する
```

**優先度: 低** | **影響度: 小** | **実装コスト: 中**

---

### US-13: コミュニティ・フォロー機能

```
As a 活動的な投稿者,
I want to 他のユーザーをフォローして投稿を追跡したい,
So that 興味のある調査者の活動を把握できる.

受け入れ条件:
- [ ] user_follows テーブル（follower_id, following_id）を作成する
- [ ] プロフィールページにフォロー/フォロー解除ボタンを追加する
- [ ] ダッシュボードに「フォロー中の人の最新投稿」セクションを追加する
- [ ] フォロー時に相手に通知を送信する
- [ ] フォロー数・フォロワー数をプロフィールに表示する
- [ ] プライバシー設定でフォロー受入可否を制御できる
```

**優先度: 低** | **影響度: 小** | **実装コスト: 中**

---

