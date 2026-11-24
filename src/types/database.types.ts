/**
 * Supabase データベーススキーマから生成した型定義
 *
 * 更新方法（スキーマ変更時）:
 *   ライブ DB があれば: npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.types.ts
 *   ライブ DB が無い場合（本リポジトリの通常運用）: supabase/schema.sql と supabase/migrations/**
 *   を唯一のソースとして本ファイルを手で更新する（列/関数の追加・改名を反映）。
 *   その後 `npm run schema:check`（CHECK 制約 ⇔ literal union の一致検証）と `npm run type-check` を必ず通すこと。
 *   運用手順の詳細は docs/requirements/REQ-246-supabase-database-typing-restore.md を参照。
 *
 * 注: `.from(x)` / `.rpc(y)` は x/y を下記の型に束縛するため、アプリが実際に叩く
 *     すべてのテーブル・関数を網羅している必要がある（欠けると type-check が壊れる）。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      community_water_bodies: {
        Row: { id: string; name: string; lat: number; lng: number; created_at: string }
        Insert: { id?: string; name: string; lat: number; lng: number; created_at?: string }
        Update: { id?: string; name?: string; lat?: number; lng?: number; created_at?: string }
        Relationships: []
      }
      water_reports: {
        Row: {
          id: string
          user_id: string
          client_id: string
          name: string
          note: string | null
          lat: number
          lng: number
          photo_paths: string[]
          status: 'pending' | 'accepted' | 'rejected'
          public_name: string | null
          published_water_body_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          name: string
          note?: string | null
          lat: number
          lng: number
          photo_paths: string[]
          status?: 'pending' | 'accepted' | 'rejected'
          public_name?: string | null
          published_water_body_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          name?: string
          note?: string | null
          lat?: number
          lng?: number
          photo_paths?: string[]
          status?: 'pending' | 'accepted' | 'rejected'
          public_name?: string | null
          published_water_body_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // REQ-325: 公開プロフィールとは分離した本人専用の回答。
      user_onboarding: {
        Row: {
          user_id: string
          region: 'akita_city' | 'north' | 'central' | 'south' | 'other'
          seen_crayfish: 'yes' | 'no' | 'maybe'
          onboarded_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          region: 'akita_city' | 'north' | 'central' | 'south' | 'other'
          seen_crayfish: 'yes' | 'no' | 'maybe'
          onboarded_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          region?: 'akita_city' | 'north' | 'central' | 'south' | 'other'
          seen_crayfish?: 'yes' | 'no' | 'maybe'
          onboarded_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ===================================================
      // posts（本体）— supabase/schema.sql の CREATE TABLE + 各 ALTER を反映
      // ===================================================
      posts: {
        Row: {
          id: string
          created_at: string
          lat: number
          lng: number
          species: 'american' | 'bullfrog'
          info_type: 'sighting' | 'capture' | 'trace' | 'damage' | 'absence'
          municipality: string | null
          comment: string | null
          photos: string[] | null
          user_id: string | null
          is_anonymous: boolean
          is_official: boolean
          count: number | null
          observed_at: string | null
          updated_at: string
          // スパム対策・システム制御
          reporter_ip: string | null
          is_flagged: boolean
          // 天気情報
          weather: 'sunny' | 'cloudy' | 'overcast' | 'rainy' | 'snowy' | 'thunderstorm' | 'unknown' | null
          temperature: number | null
          humidity: number | null
          // REQ-172: GPS 水平位置精度（m）。NULL=手動地図選択（測位なし）
          accuracy: number | null
          // REQ-243: 座標の公開レベルと粗化生成列。生 lat/lng は anon/authenticated から列 GRANT で
          // 剥奪済み（display_* を参照する）。所有者/管理者は RPC 経由で正確座標を取得する。
          location_disclosure: 'precise' | 'coarsened' | 'hidden'
          display_lat: number | null
          display_lng: number | null
          // 審査ワークフロー（モデレーション）
          status: 'pending' | 'approved' | 'rejected'
          rejection_reason: string | null
          rejection_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          // AI 画像/音声判定（ai_result は json_build_object 相当の可変構造 → Json。
          // 参照側は PostExtendedFields (AIResult) との交差で狭めて使う）
          ai_result: Json | null
          ai_analyzed_at: string | null
          auto_approved: boolean
          ai_failure_count: number
          audio_hash: string | null
          image_hashes: string[] | null
          audio_duration_ms: number | null
          // REQ-231: 逆ジオコーディングで付与する地理メタデータ（全列 NULL 許容）
          locality: string | null
          water_body: string | null
          is_on_water: boolean | null
          elevation_m: number | null
          geo_enriched_at: string | null
          geo_source: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          // 不在確認・音声・実験・定点観察・調査依頼リンク
          survey_duration_minutes: number | null
          audio_url: string | null
          location_source: 'gps' | 'manual' | 'exif' | null
          experiment_assignments: Json
          survey_method: 'structured' | 'opportunistic' | null
          survey_site_id: string | null
          survey_request_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          lat: number
          lng: number
          species: 'american' | 'bullfrog'
          info_type: 'sighting' | 'capture' | 'trace' | 'damage' | 'absence'
          municipality?: string | null
          comment?: string | null
          photos?: string[] | null
          user_id?: string | null
          is_anonymous?: boolean
          is_official?: boolean
          count?: number | null
          observed_at?: string | null
          updated_at?: string
          reporter_ip?: string | null
          is_flagged?: boolean
          weather?: 'sunny' | 'cloudy' | 'overcast' | 'rainy' | 'snowy' | 'thunderstorm' | 'unknown' | null
          temperature?: number | null
          humidity?: number | null
          accuracy?: number | null
          // REQ-243: 公開レベルは管理者/サービスロールのみ設定可（通常投稿では省略）。display_* は生成列のため Insert に無し。
          location_disclosure?: 'precise' | 'coarsened' | 'hidden'
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
          rejection_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ai_result?: Json | null
          ai_analyzed_at?: string | null
          auto_approved?: boolean
          ai_failure_count?: number
          audio_hash?: string | null
          image_hashes?: string[] | null
          audio_duration_ms?: number | null
          // REQ-231: 付与は Edge Function（service_role）が行う。投稿時は通常指定しない
          locality?: string | null
          water_body?: string | null
          is_on_water?: boolean | null
          elevation_m?: number | null
          geo_enriched_at?: string | null
          geo_source?: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          survey_duration_minutes?: number | null
          audio_url?: string | null
          location_source?: 'gps' | 'manual' | 'exif' | null
          experiment_assignments?: Json
          survey_method?: 'structured' | 'opportunistic' | null
          survey_site_id?: string | null
          survey_request_id?: string | null
        }
        Update: {
          lat?: number
          lng?: number
          species?: 'american' | 'bullfrog'
          info_type?: 'sighting' | 'capture' | 'trace' | 'damage' | 'absence'
          municipality?: string | null
          comment?: string | null
          photos?: string[] | null
          is_official?: boolean
          count?: number | null
          observed_at?: string | null
          updated_at?: string
          reporter_ip?: string | null
          is_flagged?: boolean
          weather?: 'sunny' | 'cloudy' | 'overcast' | 'rainy' | 'snowy' | 'thunderstorm' | 'unknown' | null
          temperature?: number | null
          humidity?: number | null
          accuracy?: number | null
          // REQ-231/243: 地理メタデータ・公開レベルの更新（service_role/管理者のみ。一般ユーザーは protect_post_* で OLD 固定）
          location_disclosure?: 'precise' | 'coarsened' | 'hidden'
          status?: 'pending' | 'approved' | 'rejected'
          rejection_reason?: string | null
          rejection_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ai_result?: Json | null
          ai_analyzed_at?: string | null
          auto_approved?: boolean
          ai_failure_count?: number
          audio_hash?: string | null
          image_hashes?: string[] | null
          audio_duration_ms?: number | null
          locality?: string | null
          water_body?: string | null
          is_on_water?: boolean | null
          elevation_m?: number | null
          geo_enriched_at?: string | null
          geo_source?: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          survey_duration_minutes?: number | null
          audio_url?: string | null
          location_source?: 'gps' | 'manual' | 'exif' | null
          experiment_assignments?: Json
          survey_method?: 'structured' | 'opportunistic' | null
          survey_site_id?: string | null
          survey_request_id?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          created_at: string
          post_id: string
          user_id: string
          content: string
          is_admin: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          post_id: string
          user_id: string
          content: string
          is_admin?: boolean
        }
        Update: {
          content?: string
        }
        // REQ-113: PostgREST embed（posts.select('comments(*)') / comments.select('posts(...)')）を
        // 型解決するための FK。これが無いと埋め込み select が SelectQueryError に落ちる。
        Relationships: [
          {
            foreignKeyName: 'comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: Record<string, never>
        // REQ-113: posts.select('likes(id, user_id)') 埋め込みの型解決用。
        Relationships: [
          {
            foreignKeyName: 'likes_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      reports: {
        Row: {
          id: string
          created_at: string
          post_id: string
          reason: 'spam' | 'wrong_location' | 'inappropriate' | 'other'
          comment: string | null
          reporter_ip: string | null
          resolved: boolean
        }
        Insert: {
          id?: string
          created_at?: string
          post_id: string
          reason: 'spam' | 'wrong_location' | 'inappropriate' | 'other'
          comment?: string | null
          reporter_ip?: string | null
          resolved?: boolean
        }
        Update: {
          resolved?: boolean
        }
        // REQ-246: reports.select('*, posts(...)')（AdminReportsPage）の埋め込みを型解決する FK。
        // これが無いと posts 埋め込みが SelectQueryError に落ちる（comments/likes と同じ理由）。
        Relationships: [
          {
            foreignKeyName: 'reports_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      audit_logs: {
        Row: {
          id: string
          created_at: string
          admin_id: string | null
          action: string
          target_type: string
          target_id: string | null
          details: Json | null
        }
        Insert: {
          id?: string
          created_at?: string
          admin_id?: string | null
          action: string
          target_type: string
          target_id?: string | null
          details?: Json | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      // ===================================================
      // user_profiles（GAME-001 + REQ-088/234/237 の通知 opt-in 列）
      // ===================================================
      user_profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_emoji: string | null
          bio: string | null
          is_public: boolean
          created_at: string
          updated_at: string
          notify_survey_request: boolean
          notify_response_digest: boolean
          notify_research_adopted: boolean
          notify_dormant_reengage: boolean
          notify_weekly_digest: boolean
          unsubscribe_token: string
          notify_push_post_status: boolean
          notify_push_comment: boolean
          notify_push_nearby: boolean
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_emoji?: string | null
          bio?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
          notify_survey_request?: boolean
          notify_response_digest?: boolean
          notify_research_adopted?: boolean
          notify_dormant_reengage?: boolean
          notify_weekly_digest?: boolean
          unsubscribe_token?: string
          notify_push_post_status?: boolean
          notify_push_comment?: boolean
          notify_push_nearby?: boolean
        }
        Update: {
          display_name?: string | null
          avatar_emoji?: string | null
          bio?: string | null
          is_public?: boolean
          updated_at?: string
          notify_survey_request?: boolean
          notify_response_digest?: boolean
          notify_research_adopted?: boolean
          notify_dormant_reengage?: boolean
          notify_weekly_digest?: boolean
          notify_push_post_status?: boolean
          notify_push_comment?: boolean
          notify_push_nearby?: boolean
        }
        Relationships: []
      }
      badge_definitions: {
        Row: {
          id: string
          name: string
          description: string
          icon: string
          category: 'posting' | 'quality' | 'community' | 'special'
          sort_order: number | null
        }
        Insert: {
          id: string
          name: string
          description: string
          icon: string
          category: 'posting' | 'quality' | 'community' | 'special'
          sort_order?: number | null
        }
        Update: {
          name?: string
          description?: string
          icon?: string
          category?: 'posting' | 'quality' | 'community' | 'special'
          sort_order?: number | null
        }
        Relationships: []
      }
      // REQ-248: 貢献レベル/XP（DB 権威・改竄不能）。書き込みはトリガー/関数のみ（クライアントからは書けない）。
      user_progress: {
        Row: {
          user_id: string
          xp: number
          level: number
          daily_xp: number
          daily_xp_date: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          xp?: number
          level?: number
          daily_xp?: number
          daily_xp_date?: string | null
          updated_at?: string
        }
        Update: {
          xp?: number
          level?: number
          daily_xp?: number
          daily_xp_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      // REQ-250: コレクション（図鑑/水槽）状態。承認済み投稿から導出（DB 権威・改竄不能）。
      // 書き込みはトリガー/関数のみ（クライアントからは書けない）。種ごとに 1 行（PK: user_id + species）。
      user_collection: {
        Row: {
          user_id: string
          species: 'american' | 'bullfrog'
          first_observed_at: string | null
          info_types_seen: string[]
          municipalities_seen: string[]
          verified_count: number
          updated_at: string
        }
        Insert: {
          user_id: string
          species: 'american' | 'bullfrog'
          first_observed_at?: string | null
          info_types_seen?: string[]
          municipalities_seen?: string[]
          verified_count?: number
          updated_at?: string
        }
        Update: {
          first_observed_at?: string | null
          info_types_seen?: string[]
          municipalities_seen?: string[]
          verified_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      // ===================================================
      // survey_requests（調査依頼）+ REQ-243 粗化生成列
      // ===================================================
      survey_requests: {
        Row: {
          id: string
          created_at: string
          user_id: string
          lat: number
          lng: number
          municipality: string | null
          species: 'american' | 'bullfrog' | 'unknown'
          reason: string
          urgency: 'normal' | 'urgent'
          status: 'open' | 'responded' | 'closed'
          response_count: number
          closed_at: string | null
          display_lat: number | null
          display_lng: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          lat: number
          lng: number
          municipality?: string | null
          species: 'american' | 'bullfrog' | 'unknown'
          reason: string
          urgency?: 'normal' | 'urgent'
          status?: 'open' | 'responded' | 'closed'
          response_count?: number
          closed_at?: string | null
        }
        Update: {
          municipality?: string | null
          species?: 'american' | 'bullfrog' | 'unknown'
          reason?: string
          urgency?: 'normal' | 'urgent'
          status?: 'open' | 'responded' | 'closed'
          response_count?: number
          closed_at?: string | null
        }
        Relationships: []
      }
      survey_request_responses: {
        Row: {
          id: string
          request_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          request_id?: string
          user_id?: string
        }
        Relationships: []
      }
      survey_request_comments: {
        Row: {
          id: string
          request_id: string
          user_id: string
          body: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          request_id: string
          user_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          deleted_at?: string | null
        }
        Relationships: []
      }
      // REQ-174: 定点観察（structured）プロトコルの基準点
      survey_sites: {
        Row: {
          id: string
          user_id: string
          name: string
          lat: number
          lng: number
          municipality: string | null
          species: 'american' | 'bullfrog' | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          lat: number
          lng: number
          municipality?: string | null
          species?: 'american' | 'bullfrog' | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          municipality?: string | null
          species?: 'american' | 'bullfrog' | null
          notes?: string | null
        }
        Relationships: []
      }
      // REQ-329: 名前付きで非公開保存した地点（クイック保存）。本人と管理者だけが読める。
      private_spots: {
        Row: {
          id: string
          user_id: string
          name: string
          note: string | null
          lat: number
          lng: number
          accuracy: number | null
          recorded_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          note?: string | null
          lat: number
          lng: number
          accuracy?: number | null
          recorded_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          note?: string | null
        }
        Relationships: []
      }
      // REQ-330: 調査計画。本人と管理者だけが読める（anon には GRANT 自体が無い）。
      // Update は利用者が変えてよい列だけ（user_id / created_at はトリガーが旧値に戻す）。
      survey_plans: {
        Row: {
          id: string
          user_id: string
          title: string
          planned_on: string
          status: 'active' | 'done' | 'archived'
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          planned_on?: string
          status?: 'active' | 'done' | 'archived'
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          planned_on?: string
          status?: 'active' | 'done' | 'archived'
          note?: string | null
        }
        Relationships: []
      }
      // REQ-330: 計画の地点。座標は複製して持つ（source_id は外部キーにしない）。
      // plan_id / user_id / created_at はトリガーが旧値に戻すので Update に含めない。
      survey_plan_stops: {
        Row: {
          id: string
          plan_id: string
          user_id: string
          sort_order: number
          name: string | null
          note: string | null
          lat: number
          lng: number
          source: 'pin' | 'private_spot' | 'survey_request' | 'current_location'
          source_id: string | null
          status: 'pending' | 'done' | 'skipped'
          visited_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          user_id: string
          sort_order?: number
          name?: string | null
          note?: string | null
          lat: number
          lng: number
          source: 'pin' | 'private_spot' | 'survey_request' | 'current_location'
          source_id?: string | null
          status?: 'pending' | 'done' | 'skipped'
          visited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          sort_order?: number
          name?: string | null
          note?: string | null
          lat?: number
          lng?: number
          status?: 'pending' | 'done' | 'skipped'
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'survey_plan_stops_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'survey_plans'
            referencedColumns: ['id']
          },
        ]
      }
      // REQ-330: 地点と投稿のつながり。作るか消すかだけ（UPDATE の権限が無い）。
      survey_stop_posts: {
        Row: {
          stop_id: string
          post_id: string
          user_id: string
          kind: 'sighting' | 'absence'
          created_at: string
        }
        Insert: {
          stop_id: string
          post_id: string
          user_id: string
          kind: 'sighting' | 'absence'
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'survey_stop_posts_stop_id_fkey'
            columns: ['stop_id']
            isOneToOne: false
            referencedRelation: 'survey_plan_stops'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'survey_stop_posts_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'posts'
            referencedColumns: ['id']
          },
        ]
      }
      // REQ-330: 希少種の記録。本人と管理者だけ。species_key の一覧は src/features/fieldwork/constants.ts。
      // user_id / client_id / created_at はトリガーが旧値に戻すので Update に含めない。
      rare_sightings: {
        Row: {
          id: string
          user_id: string
          client_id: string
          stop_id: string | null
          species_key: string
          species_label: string | null
          count: number | null
          note: string | null
          lat: number
          lng: number
          accuracy: number | null
          location_source: 'gps' | 'map'
          observed_at: string
          photo_paths: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          stop_id?: string | null
          species_key: string
          species_label?: string | null
          count?: number | null
          note?: string | null
          lat: number
          lng: number
          accuracy?: number | null
          location_source: 'gps' | 'map'
          observed_at?: string
          photo_paths?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          stop_id?: string | null
          species_key?: string
          species_label?: string | null
          count?: number | null
          note?: string | null
          lat?: number
          lng?: number
          accuracy?: number | null
          location_source?: 'gps' | 'map'
          observed_at?: string
          photo_paths?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'rare_sightings_stop_id_fkey'
            columns: ['stop_id']
            isOneToOne: false
            referencedRelation: 'survey_plan_stops'
            referencedColumns: ['id']
          },
        ]
      }
      // REQ-237: Web Push（PushManager）の購読
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          enabled: boolean
          created_at: string
          last_seen_at: string
          last_failed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          enabled?: boolean
          created_at?: string
          last_seen_at?: string
          last_failed_at?: string | null
        }
        Update: {
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          enabled?: boolean
          last_seen_at?: string
          last_failed_at?: string | null
        }
        Relationships: []
      }
      // ===================================================
      // ai_call_logs（AI 判定 API 呼び出しログ）— migration 20260424000003 + 20260513000001(error_kind)
      // ===================================================
      ai_call_logs: {
        Row: {
          id: string
          post_id: string | null
          function_name: 'analyze-audio' | 'analyze-image'
          model: string
          input_tokens: number | null
          output_tokens: number | null
          latency_ms: number | null
          status: 'success' | 'error' | 'skipped' | 'dedup_hit' | 'rate_limited' | 'cache_hit' | 'cache_miss'
          reanalysis: boolean
          dedup_status: 'hit' | 'miss' | 'skipped' | null
          cache_status: 'hit' | 'miss' | 'refresh' | 'error' | null
          error_message: string | null
          error_kind: string | null
          created_at: string
        }
        Insert: {
          id?: string
          post_id?: string | null
          function_name: 'analyze-audio' | 'analyze-image'
          model: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          status: 'success' | 'error' | 'skipped' | 'dedup_hit' | 'rate_limited' | 'cache_hit' | 'cache_miss'
          reanalysis?: boolean
          dedup_status?: 'hit' | 'miss' | 'skipped' | null
          cache_status?: 'hit' | 'miss' | 'refresh' | 'error' | null
          error_message?: string | null
          error_kind?: string | null
          created_at?: string
        }
        Update: {
          status?: 'success' | 'error' | 'skipped' | 'dedup_hit' | 'rate_limited' | 'cache_hit' | 'cache_miss'
          error_message?: string | null
          error_kind?: string | null
        }
        Relationships: []
      }
      /**
       * REQ-231: 逆ジオコーディング結果の DB 永続キャッシュ（座標グリッド単位）。
       * service_role のみアクセス可（RLS 有効・ポリシー無し）。
       * @see supabase/migrations/20260615000004_reverse_geocoding_place_enrichment.sql
       */
      geo_cache: {
        Row: {
          grid_key: string
          lat: number
          lng: number
          locality: string | null
          water_body: string | null
          is_on_water: boolean | null
          elevation_m: number | null
          geo_source: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          fetched_at: string
        }
        Insert: {
          grid_key: string
          lat: number
          lng: number
          locality?: string | null
          water_body?: string | null
          is_on_water?: boolean | null
          elevation_m?: number | null
          geo_source?: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          fetched_at?: string
        }
        Update: {
          locality?: string | null
          water_body?: string | null
          is_on_water?: boolean | null
          elevation_m?: number | null
          geo_source?: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
          fetched_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      review_water_report: {
        Args: { p_id: string; p_status: 'accepted' | 'rejected'; p_public_name?: string | null }
        Returns: boolean
      }
      check_email_exists: {
        Args: { lookup_email: string }
        Returns: boolean
      }
      /**
       * REQ-032 / REQ-104: Server-side aggregation for dashboard statistics.
       * @see supabase/migrations/20240101000002_dashboard_stats_rpc.sql
       */
      get_dashboard_stats: {
        Args: { p_months?: number }
        Returns: DashboardStats
      }
      /**
       * REQ-143: approved 投稿の市区町村別件数を集計して返す。
       */
      get_municipality_post_counts: {
        Args: Record<string, never>
        Returns: Array<{ municipality: string; post_count: number }>
      }
      /**
       * REQ-154: 管理ダッシュボードの種別/情報種別/月次/市区町村集計を返す。
       */
      get_admin_post_stats: {
        Args: { p_from?: string | null; p_to?: string | null; p_max_months?: number }
        Returns: AdminPostStats
      }
      /**
       * REQ-157: 調査依頼詳細（本体+投稿者プロフィール+関連投稿）を 1 往復で返す（jsonb）。
       */
      get_survey_request_detail: {
        Args: { p_id: string }
        Returns: Json
      }
      /**
       * REQ-149: 管理者ログインのサーバー側ロック判定。
       */
      admin_login_check: {
        Args: { p_email: string }
        Returns: { locked: boolean; retry_after_seconds: number }
      }
      /**
       * REQ-149: 管理者ログイン試行の記録 + 監査ログ書き込み。
       */
      admin_login_record: {
        Args: { p_email: string; p_success: boolean }
        Returns: { locked: boolean; retry_after_seconds?: number; attempt_count?: number }
      }
      /**
       * REQ-243: 投稿所有者が自分の投稿の正確座標を取得する（auth.uid()=user_id のときのみ）。
       */
      get_my_post_location: {
        Args: { p_post_id: string }
        Returns: Array<{ lat: number; lng: number; accuracy: number | null }>
      }
      /**
       * REQ-243: 管理者が投稿の正確座標を一括取得（審査/CSV/地図確認）。管理者クレーム以外は空。
       */
      get_admin_post_locations: {
        Args: { p_ids: string[] }
        Returns: Array<{ id: string; lat: number; lng: number; accuracy: number | null }>
      }
      /**
       * REQ-243 FR-243-01b: 管理者が投稿記録の公開レベルを設定する（admin クレーム必須）。
       */
      set_post_location_disclosure: {
        Args: { p_post_id: string; p_level: string }
        Returns: undefined
      }
      /**
       * REQ-243 FR-243-01b: 管理者が種ごとの既定公開レベルを設定する（admin クレーム必須）。
       */
      set_species_location_default: {
        Args: { p_species: string; p_level: string }
        Returns: undefined
      }
      // ── REQ-246 で追加（schema.sql / migrations の各シグネチャに一致） ──
      /**
       * 管理者向けユーザーリスト（admin クレーム必須）。RETURNS TABLE。
       * @see supabase/schema.sql get_admin_user_list()
       */
      get_admin_user_list: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          email: string
          created_at: string
          last_sign_in_at: string | null
          is_admin: boolean
        }>
      }
      /** 管理者権限の付与/剥奪（admin のみ）。RETURNS void。 */
      set_user_admin_role: {
        Args: { target_user_id: string; grant_admin: boolean }
        Returns: undefined
      }
      /**
       * REQ-020: 監査ログ取得（admin のみ・total_count 付きページング）。RETURNS TABLE。
       */
      get_audit_logs: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_action?: string | null
          p_from?: string | null
          p_to?: string | null
          p_admin_id?: string | null
        }
        Returns: Array<{
          id: string
          created_at: string
          admin_id: string | null
          admin_email: string | null
          action: string
          target_type: string
          target_id: string | null
          details: Json | null
          total_count: number
        }>
      }
      /** ユーザー活動サマリー（admin のみ・json_build_object の可変構造 → Json）。 */
      get_user_activity: {
        Args: { p_user_id: string }
        Returns: Json
      }
      /** REQ-166: 投稿数ランキング（is_public のみ・集計値）。RETURNS TABLE。 */
      get_user_ranking: {
        Args: { p_limit?: number; p_offset?: number; p_period?: string }
        Returns: Array<{
          rank: number
          user_id: string
          display_name: string | null
          avatar_emoji: string | null
          post_count: number
          badge_count: number
          total_count: number
        }>
      }
      /** REQ-171: 発見の多様性ランキング。RETURNS TABLE。 */
      get_user_diversity: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Array<{
          user_id: string
          display_name: string | null
          avatar_emoji: string | null
          info_type_coverage: number
          species_count: number
          municipality_count: number
          diversity_score: number
        }>
      }
      /** REQ-235: 品質連動ランキング（量×質ペア）。RETURNS TABLE。 */
      get_user_quality: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Array<{
          user_id: string
          display_name: string | null
          avatar_emoji: string | null
          verified_count: number
          total_count: number
          approval_rate: number | null
          structured_count: number
          structured_rate: number | null
          gps_good_count: number
          gps_good_rate: number | null
          avg_confidence: number | null
          quality_score: number
        }>
      }
      /**
       * REQ-248: 貢献レベル/XP の参照 RPC（集計のみ・is_public 準拠）。RETURNS TABLE（単一行）。
       * @see supabase/schema.sql get_user_progress()
       */
      get_user_progress: {
        Args: { p_user_id: string }
        Returns: Array<{
          xp: number
          level: number
          xp_into_level: number
          xp_for_next_level: number
          approved_count: number
        }>
      }
      /**
       * REQ-250: コレクション（図鑑）状態の参照 RPC（集計のみ・is_public 準拠）。RETURNS TABLE（種ごとに 1 行）。
       * @see supabase/schema.sql get_user_collection()
       */
      get_user_collection: {
        Args: { p_user_id: string }
        Returns: Array<{
          species: 'american' | 'bullfrog'
          first_observed_at: string | null
          info_types_seen: string[]
          municipalities_seen: string[]
          verified_count: number
        }>
      }
      /** REQ-173: 直近 p_days 日の市区町村別件数（空間バイアス補正ナッジ用）。RETURNS TABLE。 */
      get_undersurveyed_areas: {
        Args: { p_days?: number }
        Returns: Array<{ municipality: string; recent_count: number }>
      }
      /** ユーザー公開プロフィール詳細（json_build_object の可変構造 → Json）。 */
      get_user_profile: {
        Args: { p_user_id: string }
        Returns: Json
      }
      /** アカウント自己削除（退会）。RETURNS void。 */
      delete_own_account: {
        Args: Record<string, never>
        Returns: undefined
      }
      /** REQ-175: 自分の有効な実験バリアント（jsonb: { [experiment_key]: variant }）。 */
      get_my_experiment_variants: {
        Args: Record<string, never>
        Returns: Json
      }
      /** REQ-175: 実験メトリクス（admin/service_role のみ・jsonb 集計）。 */
      get_experiment_metrics: {
        Args: { p_experiment_key: string; p_from?: string | null; p_to?: string | null }
        Returns: Json
      }
      /** REQ-233: 獲得月コホート×経過月の保持率マトリクス（admin 限定・jsonb）。 */
      get_retention_cohorts: {
        Args: { p_months?: number }
        Returns: Json
      }
      /** REQ-233: 承認ファネル＋量×質カウンター指標（admin 限定・jsonb）。 */
      get_kpi_quality_funnel: {
        Args: { p_from?: string | null; p_to?: string | null; p_accuracy_threshold?: number }
        Returns: Json
      }
      /** REQ-233: NSM + ガードレール + KGI サマリー（admin 限定・jsonb）。 */
      get_kpi_summary: {
        Args: { p_accuracy_threshold?: number }
        Returns: Json
      }
      /** REQ-253: AI 信頼度ビン別の承認/的中率（admin 限定・集計のみ・jsonb）。 */
      get_ai_accuracy_stats: {
        Args: Record<string, never>
        Returns: Json
      }
      /** REQ-234: 配信停止トークンでライフサイクルメールを opt-out。RETURNS boolean。 */
      apply_unsubscribe: {
        Args: { p_token: string; p_category?: string }
        Returns: boolean
      }
      /** REQ-089: 調査依頼コメントのソフトデリート（本人のみ）。RETURNS void。 */
      soft_delete_request_comment: {
        Args: { comment_id: string }
        Returns: undefined
      }
      /** REQ-075: AI コスト集計（admin 限定・jsonb）。 */
      get_ai_cost_summary: {
        Args: { p_days?: number }
        Returns: Json
      }
      /** REQ-330: 計画の地点を渡した順に並べ直す（本人の計画だけ・全地点を渡す）。RETURNS void。 */
      reorder_survey_plan_stops: {
        Args: { p_plan_id: string; p_stop_ids: string[] }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

/**
 * REQ-104: `get_dashboard_stats` RPC のレスポンス型。
 * SQL 側では `jsonb` で返却されるが、構造は固定なので明示的に型付けする。
 */
export interface DashboardStats {
  total_posts: number
  this_month_posts: number
  last_month_posts: number
  species_counts: Array<{ species: string; count: number }>
  info_type_counts: Array<{ info_type: string; count: number }>
  monthly_data: Array<{ month: string; count: number }>
  municipality_counts: Array<{ municipality: string; count: number }>
}

/**
 * REQ-154: `get_admin_post_stats` RPC のレスポンス型。jsonb で返却される。
 */
export interface AdminPostStats {
  species_counts: Array<{ species: string; count: number }>
  info_type_counts: Array<{ info_type: string; count: number }>
  municipality_counts: Array<{ municipality: string; count: number }>
  monthly: Array<{ month: string; count: number }>
}
