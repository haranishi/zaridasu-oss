## 9. マイグレーション計画

### Migration-283-01: フィールド基盤を追加

- `exploration_cells`, `field_missions`, `field_sessions`, `field_safety_reports` を追加
- RLS、CHECK、インデックス、adminポリシーを追加
- 既存テーブルへの破壊的変更なし
- ロールバック: 新機能フラグを0%にしてから新規テーブルを削除可能

### Migration-283-02: 投稿接続

- `posts.entry_mode NOT NULL DEFAULT 'opportunistic'`
- `posts.field_session_id NULL`
- `posts.field_evidence JSONB NULL`
- 既存行のデータ移行不要
- `field_session_id` はUNIQUEかつ所有者整合をRPCで強制

### Migration-283-03: 承認済み貢献

- `cell_contributions` を追加
- 承認トリガー／関数へ冪等なセル貢献処理を追加
- REQ-248・250の既存処理と同一承認イベントへ接続
- `post_id UNIQUE` により二重付与を防止

### Migration-283-04: 初期セル・ミッション投入

- MVP対象8〜12地点を管理者確認後にseed
- 既存承認投稿を公開レベルに従ってセル状態へ集計
- `hidden` 記録は公開セルの個体特定に利用しない
- 正式ロールアウト前にプライバシー逆算テストを行う

### Migration-283-05: Offline Outboxと冪等キー

- `posts.client_submission_id UUID NULL` と `posts.client_created_at TIMESTAMPTZ NULL` を追加
- `(user_id, client_submission_id)` の部分UNIQUEインデックスを追加
- 同期prepare／finalize Route Handlerと未確定メディア清掃ジョブを追加
- IndexedDBをv2から次版へ後方互換移行し、旧下書きを `draft`、旧 `sending` を `retry_wait` に変換
- Service WorkerへBackground Sync対応を機能検出付きで追加するが、非対応時の前景同期を残す
- ロールバック時も端末Outboxを消去せず、現行の手動送信画面で回収可能にする

---

## 10. 計測・実験要件

### 10.1 実験

- `experiments.key = 'field_exploration_v1'`
- control: 現行の見る地図＋通常投稿
- treatment A: 探索セル＋ミッション＋仮発見
- treatment B（十分な標本がある場合のみ）: A＋地域進捗

小標本の場合はcontrol / treatmentの2群へ絞る。

### 10.2 イベント

| イベント | 主要属性 |
|---|---|
| `field_map_view` | variant, municipality, location_permission |
| `field_cell_select` | cell_state, distance_band |
| `field_mission_view` | mission_type, difficulty |
| `field_mission_start` | entry, location_accuracy_band |
| `field_arrival` | distance_band, accuracy_band |
| `field_scan_step_complete` | role, retry_count, warning |
| `field_submit` | evidence_complete, survey_duration |
| `field_provisional_view` | ai_candidate, confidence_band |
| `field_review_result` | approved/rejected/needs_info |
| `field_safety_report` | reason |
| `field_offline_pack_saved` | mission_type, pack_size_band, persistence_granted |
| `field_outbox_saved` | media_count, payload_size_band, entry_mode |
| `field_sync_attempt` | trigger, attempt_band, network_hint |
| `field_sync_result` | success/retry/auth/edit/review, duration_band |

GA4にはcell_id、正確位置、写真URL、自由記述を送らない。

### 10.3 KPI

- activation: map view → mission view → start → arrival → submit
- quality: 承認率、写真3枠充足率、GPS精度、AI／管理者一致
- coverage: 新規セル、再調査セル、地域偏り
- retention: D7、W4、2回目ミッション完了
- safety: 危険・私有地・夜間開始、事故報告
- integrity: 重複率、却下率、不正リスク率
- offline reliability: Outbox保存成功率、復帰後同期成功率、同期所要時間、再試行回数、容量不足率、端末残留件数

### 10.4 検証仮説

- H283-1: 探索セル表示は通常地図よりミッション開始率を高める。
- H283-2: 3枠スキャンは通常投稿より写真要件充足率を高める。
- H283-3: 仮発見＋地域進捗は承認率を下げずにW1再訪率を高める。
- H283-4: 未調査セル報酬は投稿数を増やすだけでなく空間被覆を改善する。
- H283-5: Offline Outboxは圏外・弱回線セッションの提出完了率を高め、オンライン投稿と比べて承認率を低下させない。

---

