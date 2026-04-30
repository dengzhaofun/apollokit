/**
 * Smoke example for `@apollokit/client` — type-check only.
 *
 * Run target: not for `node` execution (we don't want real cpk_/csk_
 * credentials in CI). Instead this file is included in `tsc`'s input
 * so `pnpm check-types` verifies the wrapper types align with the
 * generated SDK service classes end-to-end. If a server route changes
 * its client schema and the SDK isn't regenerated, this fails to typecheck.
 */

import {
  ApolloKitApiError,
  BadgeClientService,
  CheckInClientService,
  createClient,
  isErrorEnvelope,
  signEndUser,
} from '@apollokit/client'

async function browserDemo() {
  // Browser / mini-program / Unity (no csk_): caller passes the
  // userHash that came from your own backend's pre-signing endpoint.
  createClient({
    baseUrl: 'https://api.example.com',
    publishableKey: 'cpk_demo_pub',
    // secret intentionally omitted — never ship csk_ to clients
  })

  const endUserId = 'player_42'
  const userHash = '<from your /auth/apollokit-creds endpoint>'

  const { data } = await BadgeClientService.badgeClientGetTree({
    headers: { 'x-end-user-id': endUserId, 'x-user-hash': userHash },
    throwOnError: true,
  })
  console.log(`badge nodes: ${data[200].data.nodes.length}`)
}

async function nodeDemo() {
  // Trusted Node / SSR / proxy: pass csk_ and the SDK installs an
  // async interceptor that auto-signs each request. Caller no longer
  // touches HMAC — write headers as if x-end-user-id were enough.
  createClient({
    baseUrl: 'https://api.example.com',
    publishableKey: 'cpk_smoke_example' as string,
    secret: 'csk_smoke_example' as string,
  })

  // No x-user-hash — the interceptor adds it from secret + endUserId.
  const { data } = await CheckInClientService.checkInClientPostCheckIns({
    headers: { 'x-end-user-id': 'player_42' },
    body: { configKey: 'daily' },
    throwOnError: true,
  })
  console.log({
    state: data[200].data.state,
    requestId: data[200].requestId,
  })
}

async function manualOverride() {
  // Edge case: secret configured, but for one specific call we want
  // to sign on behalf of a different user. Passing x-user-hash
  // explicitly makes the interceptor leave that header alone.
  const adminEndUser = 'support_agent_7'
  const adminHash = await signEndUser(adminEndUser, 'csk_smoke_example' as string)

  const { data, error, response } = await BadgeClientService.badgeClientGetTree({
    headers: { 'x-end-user-id': adminEndUser, 'x-user-hash': adminHash },
  })
  if (error && isErrorEnvelope(error)) {
    throw new ApolloKitApiError(error, response.status)
  }
  if (data && data[200]?.code === 'ok') {
    console.log(data[200].data.nodes)
  }
}

export { browserDemo, nodeDemo, manualOverride }
