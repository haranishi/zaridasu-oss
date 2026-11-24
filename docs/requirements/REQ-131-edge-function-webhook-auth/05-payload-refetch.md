#### C. payload.record を信用しない設計への転換

- [ ] **FR-131-06: `notify-post-status` を「id 受領 → service-role 再 fetch」型に変更**
  - payload からは `record.id` と `old_record.status` のみ受領
  - `id` で `posts` テーブルを service-role で再 fetch し、その結果のみを通知本文（rejection_message 等）に使用
  - 通知冪等性のため `notification_log` テーブル（新設）に `post_id, status, sent_at` を unique 制約付きで記録（既送なら skip）

- [ ] **FR-131-07: `analyze-image` / `analyze-audio` の webhook 経路を `id` のみ受領に変更**
  - payload から `record.id` のみ受領
  - `posts` テーブルから service-role で再 fetch し、`photos / audio_url / ai_analyzed_at / status` を確認
  - 既存の reanalysis 経路（JWT 必須 + 投稿者本人/admin チェック）は維持

- [ ] **FR-131-08: `notify-survey-request` を `event_type + request_id` のみ受領に変更**
  - 現状の実装はすでに `survey_requests` から再 fetch しているため、FR-131-03 の secret 検証追加のみで足りる
  - ただし `initiatorId` (`payload.user_id`) の検証は強化（DB の `request.user_id` / 直近 response の user_id と一致するか）
