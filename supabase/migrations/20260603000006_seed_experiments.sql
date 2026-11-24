-- REQ-175/170/171: 実験定義のシード（冪等）
-- ai_feedback=REQ-170（説明付きAIフィードバック）、new_ranking=REQ-171（発見の多様性ビュー）。
-- 既に存在する場合は何もしない（ON CONFLICT DO NOTHING）= 後から DB 側で enabled/rollout を
-- 変更しても再適用で上書きされない。停止したい場合は UPDATE experiments SET enabled=false。
INSERT INTO experiments (key, description, enabled, rollout_percentage, variants, started_at)
VALUES
  ('ai_feedback', 'REQ-170 説明付きAIフィードバック', true, 50, ARRAY['control','treatment'], now()),
  ('new_ranking', 'REQ-171 発見の多様性ビュー',     true, 50, ARRAY['control','treatment'], now())
ON CONFLICT (key) DO NOTHING;
