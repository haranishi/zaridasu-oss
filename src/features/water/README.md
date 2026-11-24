# Water discovery

The map searches OSM water bodies and reviewed community locations. Survey candidates use a separate,
unfiltered read of approved posts with `display_lat/display_lng`; private records never affect the result.
Geometry plus a 150m margin accommodates rounded public positions. Missing public records indicate a
candidate, not proof that nobody has surveyed the site. Failed reads, missing counts and truncated
results give an unknown result. An exact count of 1000 with 1000 valid positions is complete.

`water_reports` and `water-report-photos` are private to the owner and administrators. A report requires
a name, one to three photos and a retained location; notes are optional. Uploads use reduced JPEGs with
EXIF removed. `(user_id, client_id)` makes retries idempotent. DB limits are 20 reports/hour and 1000/user.

`review_water_report` checks the administrator's signed `app_metadata`, locks the report, and commits
review state, audit entry and public projection together. The checked public name is retained separately
from the submitted name. `community_water_bodies` contains only its independent ID, checked name,
coordinates rounded to three decimals and publication time. Photos, notes, report IDs and user IDs are
never copied into that table. Rejecting or deleting a report removes its public projection.

Reports have no direct UPDATE permission. Public locations have SELECT permission only. Storage has
owner-folder INSERT, owner/admin SELECT and DELETE, and no UPDATE. Account deletion must first remove
the owner's photos using the Storage API; cascading report deletion then removes public projections.

The schema source is `supabase/schema.sql`; migration
`20261008100350_water_discovery_reports.sql` also runs after CI's default grants to restore these
permissions. `supabase/tests/rls_water_discovery.sql` covers report, review, publication and photo rights.

While the list is open, fixed bottom promos (`SignupBanner`, `IntroPrompt`, `InstallBanner`) are hidden by a
`globals.css` rule that matches their `data-bottom-promo` attribute. They sit above the map and covered
69-93% of the list at 390x667 and 38-81% at 1366x680, so the rule is not limited to phone widths. Any new
fixed bottom promo must carry the attribute; `tests/e2e/nearby-water.spec.ts` covers the three existing ones.

既知の制約: 状態表示に「公開記録を確認できませんでした」などの失敗文が出ているとき、高さ667px以下のスマホ（390×667、360×640）ではパネル下端が下部ナビの上端を最大約43px越える（高さ844pxでは収まる）。高さ667px以下では冒頭約175pxのため最初の候補はスクロール後に見える。距離は検索時の地図中心からの値で、地図移動後も更新しない。
