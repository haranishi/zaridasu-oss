import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readLocalStatus, writeLocalEnvironment } from './lib/localSupabase'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2]
try {
  const config = readLocalStatus(root)
  if (mode === 'env') {
    writeLocalEnvironment(root, config)
    console.log('Created .env.local for the local stack. Existing files are never overwritten.')
  } else if (mode === 'seed') {
    if (!config.SERVICE_ROLE_KEY) throw new Error('Local service-role key is unavailable')
    // Credentials from the local CLI are used only after the loopback URL guard.
    const client = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const email = 'demo@example.test'
    const password = 'Local-Demo-Only123!'
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true })
    let user = created.data.user
    if (created.error) {
      if (!['email_exists', 'email_already_exists'].includes(created.error.code ?? '')) {
        throw new Error('Could not create the local demo account')
      }
      const listed = await client.auth.admin.listUsers()
      if (listed.error) throw new Error('Could not find the local demo account')
      user = listed.data.users.find(entry => entry.email === email) ?? null
    }
    if (!user) throw new Error('Local demo account is missing')
    const profile = await client.from('user_profiles').update({ display_name: '開発用デモ' }).eq('id', user.id)
    if (profile.error) throw new Error('Could not update the local demo profile')
    const posts = await client.from('posts').upsert([
      { id: '00000000-0000-4000-8000-000000000101', species: 'american', lat: 39.72, lng: 140.10 },
      { id: '00000000-0000-4000-8000-000000000102', species: 'bullfrog', lat: 39.718, lng: 140.105 },
    ].map(post => ({
      ...post, user_id: user.id, status: 'approved', info_type: 'sighting',
      is_anonymous: true, municipality: '開発用・架空の地域',
      comment: '[開発用の架空投稿] 実際の観察記録ではありません。', photos: [],
    })))
    if (posts.error) throw new Error('Could not insert fictional local posts')
    console.log('Local demo account and 2 fictional posts are ready. No production data was copied.')
  } else {
    throw new Error('Choose env or seed')
  }
} catch (error) {
  // Do not forward CLI/provider output, which can contain credentials.
  console.error(error instanceof Error ? error.message : 'Local setup failed')
  process.exitCode = 1
}
