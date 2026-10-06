// Tests for the OpenMeet event tooling. No test framework — node:test.
//
//   node --test scripts/*.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readEvent, isCancelled, secondTuesday, highestMeetupNumber } from './events-lib.mjs'
import { startInstant, statedOffsetIsWrong, zonedToUtc } from './datetime.mjs'

// A tiny stand-in for fetch that records calls and replays scripted responses.
function mockFetch(responses) {
  const calls = []
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', headers: options.headers, body: options.body })
    const key = `${options.method ?? 'GET'} ${new URL(url).pathname}`
    const scripted = responses[key]
    if (!scripted) {
      return new Response(JSON.stringify({ message: `no mock for ${key}` }), { status: 500 })
    }
    const entry = Array.isArray(scripted) ? scripted.shift() : scripted
    return new Response(JSON.stringify(entry.body ?? {}), { status: entry.status ?? 200 })
  }
  return { impl, calls }
}

async function withTempEvent(frontmatter, body = 'Body text.') {
  const dir = await mkdtemp(join(tmpdir(), 'vuejs-event-'))
  const path = join(dir, 'event.md')
  await writeFile(path, `---\n${frontmatter}\n---\n\n${body}`)
  return path
}

test('readEvent parses quoted and unquoted scalars', async () => {
  const path = await withTempEvent(
    ['title: "Vue.js // Berlin #111 - Hack\'n\'Tell"', 'date: 2026-11-10T19:00:00+01:00', 'slug: 2026-11-10-vuejs-berlin'].join('\n')
  )
  const event = await readEvent(path)
  assert.equal(event.frontmatter.title, "Vue.js // Berlin #111 - Hack'n'Tell")
  assert.equal(event.frontmatter.date, '2026-11-10T19:00:00+01:00')
  assert.equal(event.body.trim(), 'Body text.')
})

test('readEvent throws when frontmatter is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vuejs-event-'))
  const path = join(dir, 'bad.md')
  await writeFile(path, 'no frontmatter here')
  await assert.rejects(() => readEvent(path), /No frontmatter/)
})

test('isCancelled keys off the filename suffix', () => {
  assert.equal(isCancelled('2026-07-vuejs-berlin.cancelled.md'), true)
  assert.equal(isCancelled('2026-08-vuejs-berlin.md'), false)
})

test('secondTuesday finds the second Tuesday in both start-of-week cases', () => {
  assert.equal(secondTuesday(2026, 7).getDate(), 11) // August, starts Saturday
  assert.equal(secondTuesday(2026, 10).getDate(), 10) // November, starts Sunday
  assert.equal(secondTuesday(2026, 5).getDate(), 9) // June, starts Monday
  assert.equal(secondTuesday(2026, 9).getDate(), 13) // October, starts Thursday
})

test('highestMeetupNumber scans titles and ignores unnumbered ones', () => {
  const events = [
    { frontmatter: { title: 'Vue.js // Berlin #110 - HacknTell' } },
    { frontmatter: { title: 'Vue.js // Berlin July 2026' } },
    { frontmatter: { title: 'Vue.js // Berlin' } }
  ]
  assert.equal(highestMeetupNumber(events), 110)
})

test('startInstant resolves 19:00 Europe/Berlin across DST', () => {
  const winter = startInstant('2026-12-08T19:00:00+01:00', '19:00')
  const summer = startInstant('2026-08-11T19:00:00+01:00', '19:00')

  assert.equal(winter.toISOString(), '2026-12-08T18:00:00.000Z') // CET, UTC+1
  assert.equal(summer.toISOString(), '2026-08-11T17:00:00.000Z') // CEST, UTC+2

  // Both land back on 19:00 in Berlin, which is the point.
  for (const instant of [winter, summer]) {
    assert.equal(
      instant.toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      '19:00'
    )
  }
})

test('startInstant ignores a wrong offset in the file', () => {
  // August is UTC+2; this file claims +01:00. Berlin time must still be 19:00.
  const instant = startInstant('2026-08-11T19:00:00+01:00', '19:00')
  assert.equal(instant.toISOString(), '2026-08-11T17:00:00.000Z')
})

test('zonedToUtc survives the spring-forward day', () => {
  // 2026-03-08 is the DST switch in Europe; 19:00 is unambiguous either way.
  const instant = zonedToUtc(2026, 3, 8, 19, 0)
  assert.equal(instant.toISOString(), '2026-03-08T18:00:00.000Z')

  const before = zonedToUtc(2026, 3, 7, 19, 0) // still CET, UTC+1
  assert.equal(before.toISOString(), '2026-03-07T18:00:00.000Z')
})

test('statedOffsetIsWrong flags only genuinely stale offsets', () => {
  assert.equal(statedOffsetIsWrong('2026-12-08T19:00:00+01:00', '19:00'), false)
  assert.equal(statedOffsetIsWrong('2026-07-14T19:00:00+02:00', '19:00'), false)
  assert.equal(statedOffsetIsWrong('2026-08-11T19:00:00+01:00', '19:00'), true)
  assert.equal(statedOffsetIsWrong('2026-07-14T19:00:00+01:00', '19:00'), true)
})

test('the group id is resolved from the slug once and cached', async () => {
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/email/login': { body: { token: 'tok', refreshToken: 'ref', tokenExpires: Date.now() + 60_000 } },
    'GET /api/groups/vuejs-berlin': { body: { id: 4242, slug: 'vuejs-berlin' } }
  })
  globalThis.fetch = impl

  const { OpenMeetClient } = await import('./openmeet-client.mjs')
  process.env.OPENMEET_EMAIL = 'bot@example.com'
  process.env.OPENMEET_PASSWORD = 'secret'

  const client = new OpenMeetClient()
  assert.equal(await client.groupId(), 4242)
  assert.equal(await client.groupId(), 4242)

  const lookups = calls.filter(c => c.url.endsWith('/api/groups/vuejs-berlin'))
  assert.equal(lookups.length, 1, 'should not re-resolve the group id')
})

test('the client logs in, sends tenant header, and creates an event', async () => {
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/email/login': { body: { token: 'tok', refreshToken: 'ref', tokenExpires: Date.now() + 60_000 } },
    'POST /api/events': { status: 201, body: { slug: 'vuejs-berlin-111-abc' } }
  })
  globalThis.fetch = impl

  const { OpenMeetClient, eventUrl } = await import('./openmeet-client.mjs')
  process.env.OPENMEET_EMAIL = 'bot@example.com'
  process.env.OPENMEET_PASSWORD = 'secret'

  const client = new OpenMeetClient()
  const created = await client.createEvent({ name: 'Vue.js // Berlin #111' })

  assert.equal(created.slug, 'vuejs-berlin-111-abc')
  assert.equal(eventUrl(created.slug), 'https://platform.openmeet.net/events/vuejs-berlin-111-abc')

  const create = calls.find(c => c.url.endsWith('/api/events'))
  assert.equal(create.headers['x-tenant-id'], 'lsdfaopkljdfs')
  assert.equal(create.headers.Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(create.body), { name: 'Vue.js // Berlin #111' })
})

test('the client refreshes an expired token before the first call', async () => {
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/email/login': { body: { token: 'fresh', refreshToken: 'r1', tokenExpires: Date.now() + 60_000 } },
    'POST /api/v1/auth/refresh': { body: { token: 'rotated', refreshToken: 'r2', tokenExpires: Date.now() + 60_000 } },
    'GET /api/groups/vuejs-berlin/events': { body: [] }
  })
  globalThis.fetch = impl

  const { OpenMeetClient } = await import('./openmeet-client.mjs')
  process.env.OPENMEET_EMAIL = 'bot@example.com'
  process.env.OPENMEET_PASSWORD = 'secret'

  // An already-expired token must not be sent; the client logs in first.
  const client = new OpenMeetClient()
  await client.listGroupEvents()

  assert.equal(calls[0].url.endsWith('/api/v1/auth/email/login'), true)
  const list = calls.find(c => c.url.endsWith('/api/groups/vuejs-berlin/events'))
  assert.equal(list.headers.Authorization, 'Bearer fresh')
})

test('the client re-authenticates when a refresh fails', async () => {
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/email/login': [
      { body: { token: 'stale', refreshToken: 'r0', tokenExpires: Date.now() + 60_000 } },
      { body: { token: 'brandnew', refreshToken: 'r9', tokenExpires: Date.now() + 60_000 } }
    ],
    'POST /api/v1/auth/refresh': { status: 401, body: { message: 'refresh token spent' } },
    'GET /api/groups/vuejs-berlin/events': [
      { status: 401, body: { message: 'expired' } },
      { body: [] }
    ]
  })
  globalThis.fetch = impl

  const { OpenMeetClient } = await import('./openmeet-client.mjs')
  process.env.OPENMEET_EMAIL = 'bot@example.com'
  process.env.OPENMEET_PASSWORD = 'secret'

  // The first token looks valid but the server 401s; refresh is also rejected,
  // so the client must fall back to a full login.
  const client = new OpenMeetClient()
  await client.listGroupEvents()

  const listCalls = calls.filter(c => c.url.endsWith('/api/groups/vuejs-berlin/events'))
  assert.equal(listCalls.length, 2)
  assert.equal(listCalls[0].headers.Authorization, 'Bearer stale')
  assert.equal(listCalls[1].headers.Authorization, 'Bearer brandnew')
  assert.equal(calls.filter(c => c.url.endsWith('/api/v1/auth/email/login')).length, 2)
})

test('the client stops after one refresh retry and one login', async () => {
  const { impl, calls } = mockFetch({
    'POST /api/v1/auth/email/login': [
      { body: { token: 'a', refreshToken: 'r0', tokenExpires: Date.now() + 60_000 } },
      { body: { token: 'b', refreshToken: 'r1', tokenExpires: Date.now() + 60_000 } }
    ],
    'POST /api/v1/auth/refresh': { body: { token: 'c', refreshToken: 'r2', tokenExpires: Date.now() + 60_000 } },
    'GET /api/groups/vuejs-berlin/events': { status: 401, body: { message: 'nope' } }
  })
  globalThis.fetch = impl

  const { OpenMeetClient } = await import('./openmeet-client.mjs')
  process.env.OPENMEET_EMAIL = 'bot@example.com'
  process.env.OPENMEET_PASSWORD = 'secret'

  const client = new OpenMeetClient()
  await assert.rejects(() => client.listGroupEvents(), /401/)

  const listCalls = calls.filter(c => c.url.endsWith('/api/groups/vuejs-berlin/events'))
  assert.equal(listCalls.length, 3) // stale, refreshed, re-logged-in
  assert.equal(listCalls[1].headers.Authorization, 'Bearer c')
  assert.equal(listCalls[2].headers.Authorization, 'Bearer b')
})
