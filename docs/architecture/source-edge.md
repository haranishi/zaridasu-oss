# ソース索引：Edge Functions

[全体の索引](source-map.md)へ戻る。ファイルを開き、担当する説明で責任・処理の流れ・制約を読む。

| ファイル | 役割を説明する文書 |
|---|---|
| [supabase/functions/.deploy-ignore](<../../supabase/functions/.deploy-ignore>) | [Edgeの入口と共有処理](edge-functions.md) |
| [supabase/functions/_shared/__tests__/aiDedup.test.ts](<../../supabase/functions/_shared/__tests__/aiDedup.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/aiKillSwitch.test.ts](<../../supabase/functions/_shared/__tests__/aiKillSwitch.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/aiRetryConfig.test.ts](<../../supabase/functions/_shared/__tests__/aiRetryConfig.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/aiSchema.test.ts](<../../supabase/functions/_shared/__tests__/aiSchema.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/cors.test.ts](<../../supabase/functions/_shared/__tests__/cors.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/mailer.test.ts](<../../supabase/functions/_shared/__tests__/mailer.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/sharedModules.test.ts](<../../supabase/functions/_shared/__tests__/sharedModules.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/supabaseAdmin.test.ts](<../../supabase/functions/_shared/__tests__/supabaseAdmin.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/webhookAuth.test.ts](<../../supabase/functions/_shared/__tests__/webhookAuth.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/__tests__/webpush.test.ts](<../../supabase/functions/_shared/__tests__/webpush.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/_shared/aiCache.ts](<../../supabase/functions/_shared/aiCache.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiDedup.ts](<../../supabase/functions/_shared/aiDedup.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiKillSwitch.ts](<../../supabase/functions/_shared/aiKillSwitch.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiLogging.ts](<../../supabase/functions/_shared/aiLogging.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiRateLimit.ts](<../../supabase/functions/_shared/aiRateLimit.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiRetryConfig.ts](<../../supabase/functions/_shared/aiRetryConfig.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/aiSchema.ts](<../../supabase/functions/_shared/aiSchema.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/_shared/geocodeProvider.ts](<../../supabase/functions/_shared/geocodeProvider.ts>) | [外部連携](external-services.md) |
| [supabase/functions/_shared/geocodeThrottle.ts](<../../supabase/functions/_shared/geocodeThrottle.ts>) | [外部連携](external-services.md) |
| [supabase/functions/_shared/mailer.ts](<../../supabase/functions/_shared/mailer.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/_shared/supabaseAdmin.ts](<../../supabase/functions/_shared/supabaseAdmin.ts>) | [Edgeの入口と共有処理](edge-functions.md) |
| [supabase/functions/_shared/webhookAuth.ts](<../../supabase/functions/_shared/webhookAuth.ts>) | [Edgeの入口と共有処理](edge-functions.md) |
| [supabase/functions/_shared/webpush.ts](<../../supabase/functions/_shared/webpush.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/analyze-audio/__tests__/handler.test.ts](<../../supabase/functions/analyze-audio/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/analyze-audio/index.test.ts](<../../supabase/functions/analyze-audio/index.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/analyze-audio/index.ts](<../../supabase/functions/analyze-audio/index.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/analyze-image/index.test.ts](<../../supabase/functions/analyze-image/index.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/analyze-image/index.ts](<../../supabase/functions/analyze-image/index.ts>) | [AI分析・自動審査](notifications-ai-analysis.md) |
| [supabase/functions/deno.lock](<../../supabase/functions/deno.lock>) | [Edgeの入口と共有処理](edge-functions.md) |
| [supabase/functions/enrich-place/__tests__/geocodeProvider.test.ts](<../../supabase/functions/enrich-place/__tests__/geocodeProvider.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/enrich-place/__tests__/geocodeThrottle.test.ts](<../../supabase/functions/enrich-place/__tests__/geocodeThrottle.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/enrich-place/__tests__/handler.test.ts](<../../supabase/functions/enrich-place/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/enrich-place/index.ts](<../../supabase/functions/enrich-place/index.ts>) | [外部連携](external-services.md) |
| [supabase/functions/health-gemini/__tests__/handler.test.ts](<../../supabase/functions/health-gemini/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/health-gemini/index.ts](<../../supabase/functions/health-gemini/index.ts>) | [Edgeの入口と共有処理](edge-functions.md) |
| [supabase/functions/notify-ai-anomaly/__tests__/handler.test.ts](<../../supabase/functions/notify-ai-anomaly/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/notify-ai-anomaly/index.ts](<../../supabase/functions/notify-ai-anomaly/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-comment/__tests__/handler.test.ts](<../../supabase/functions/notify-comment/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/notify-comment/index.ts](<../../supabase/functions/notify-comment/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-dormant-reengage/index.ts](<../../supabase/functions/notify-dormant-reengage/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-gemini-key-failure/__tests__/handler.test.ts](<../../supabase/functions/notify-gemini-key-failure/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/notify-gemini-key-failure/index.ts](<../../supabase/functions/notify-gemini-key-failure/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-post-status/__tests__/handler.test.ts](<../../supabase/functions/notify-post-status/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/notify-post-status/index.ts](<../../supabase/functions/notify-post-status/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-research-adopted/index.ts](<../../supabase/functions/notify-research-adopted/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-survey-request/__tests__/handler.test.ts](<../../supabase/functions/notify-survey-request/__tests__/handler.test.ts>) | [検証・検証データ（検証）](validation.md) |
| [supabase/functions/notify-survey-request/index.ts](<../../supabase/functions/notify-survey-request/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/notify-weekly-digest/index.ts](<../../supabase/functions/notify-weekly-digest/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/send-push/index.ts](<../../supabase/functions/send-push/index.ts>) | [通知・AI](notifications-ai.md) |
| [supabase/functions/social-announce/index.ts](<../../supabase/functions/social-announce/index.ts>) | [通知・AI](notifications-ai.md) |
