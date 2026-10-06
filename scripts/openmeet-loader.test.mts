// Checks for the build-time OpenMeet data loader used by OpenMeetCalendar.vue.
//
//   node --test scripts/openmeet-loader.test.mts
//
// Node's test runner needs the mts loader flag to import TypeScript directly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

async function withStub(handler, run) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, resolve))
  const url = `http://localhost:${server.address().port}/api/embed/groups/vuejs-berlin/events?limit=5`
  process.env.OPENMEET_API = url
  try {
    await run()
  } finally {
    delete process.env.OPENMEET_API
    server.close()
  }
}

// Each test needs a fresh module instance, since the loader caches for 5 minutes.
const LOADER = new URL('../openmeet.data.mts', import.meta.url).href
let bust = 0
async function loadFresh() {
  return import(`${LOADER}?bust=${bust++}`)
}

test('upcoming events are parsed from the embed endpoint', async () => {
  await withStub(
    (req, res) => {
      assert.equal(req.headers['x-tenant-id'], 'lsdfaopkljdfs')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          group: { name: 'Vuejs//Berlin', slug: 'vuejs-berlin', url: 'https://platform.openmeet.net/groups/vuejs-berlin' },
          events: [
            {
              slug: 'vuejsberlin-111-abc',
              name: 'Vue.js // Berlin #111',
              startDate: '2026-10-13T17:00:00.000Z',
              timeZone: 'Europe/Berlin',
              location: 'Wikimedia Deutschland',
              url: 'https://platform.openmeet.net/events/vuejsberlin-111-abc',
              attendeesCount: 42
            }
          ],
          meta: { total: 1, limit: 5, platformUrl: 'https://platform.openmeet.net' }
        })
      )
    },
    async () => {
      const { fetchEvents } = await loadFresh()
      const events = await fetchEvents()
      assert.equal(events.length, 1)
      assert.equal(events[0].name, 'Vue.js // Berlin #111')
      assert.equal(events[0].attendeesCount, 42)
    }
  )
})

test('a failed request throws, and the loader turns that into an empty list', async () => {
  await withStub(
    (req, res) => {
      res.writeHead(503)
      res.end('unavailable')
    },
    async () => {
      const { fetchEvents, default: loader } = await loadFresh()
      await assert.rejects(() => fetchEvents(), /503/)

      const warn = console.warn
      console.warn = () => {}
      try {
        // This must not throw — a broken OpenMeet must not break the build.
        assert.deepEqual(await loader.load([]), [])
      } finally {
        console.warn = warn
      }
    }
  )
})

test('a response with no events yields an empty list', async () => {
  await withStub(
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ group: {}, events: [], meta: { total: 0 } }))
    },
    async () => {
      const { fetchEvents } = await loadFresh()
      assert.deepEqual(await fetchEvents(), [])
    }
  )
})

test('load() returns the array itself, not a { data } wrapper', async () => {
  await withStub(
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          group: {},
          events: [{ slug: 'a', name: '#111', startDate: '2026-10-13T17:00:00.000Z' }],
          meta: { total: 1 }
        })
      )
    },
    async () => {
      const { default: loader } = await loadFresh()
      const result = await loader.load([])

      // Regression guard. VitePress serialises load()'s return value directly
      // into `export const data`, so a wrapper object here reaches the component
      // as an object — `events.length` becomes undefined and the list never
      // renders, with no error to hint at the cause.
      assert.ok(Array.isArray(result), 'load() must return an array')
      assert.equal((result as unknown[]).length, 1)
    }
  )
})