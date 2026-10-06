// Exercises sync-events.mjs end to end against a stubbed OpenMeet API: create,
// no-op re-run, edit, and cancel. Run with: node scripts/sync-events.e2e.mjs
//
// This is a manual check rather than part of `pnpm test` because it drives a
// whole child process against a temporary HTTP server.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let events = []
let nextId = 1000
let loginCount = 0
let uploads = 0
const storedUploads = []

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  // Storage receives the presigned PUT directly, carrying neither the tenant
  // header nor a bearer token — so this must precede both guards.
  const storage = url.pathname.match(/^\/storage\/(\d+)$/)
  if (storage && req.method === 'PUT') {
    const bytes = await readBody(req)
    storedUploads.push({ bytes: bytes.length, contentType: req.headers['content-type'] })
    return send(200, {})
  }

  if (req.headers['x-tenant-id'] !== 'lsdfaopkljdfs') return send(401, { message: 'Tenant ID is required' })

  if (url.pathname === '/api/v1/auth/email/login') {
    loginCount++
    return send(200, { token: `t${loginCount}`, refreshToken: 'r', tokenExpires: Date.now() + 600_000 })
  }

  if (req.headers.authorization !== `Bearer t${loginCount}`) {
    return send(401, { message: 'bad token' })
  }

  if (url.pathname === '/api/groups/vuejs-berlin/events') return send(200, events)

  if (url.pathname === '/api/groups/vuejs-berlin') {
    // The sync resolves the numeric id from the slug rather than hardcoding it.
    return send(200, { id: 4242, slug: 'vuejs-berlin', name: 'Vuejs//Berlin' })
  }

  if (url.pathname === '/api/v1/files/upload' && req.method === 'POST') {
    // The hosted platform uses the s3-presigned driver: JSON metadata in,
    // presigned URL out, bytes PUT straight to storage.
    const body = await readJsonBody(req)
    assert.equal(req.headers['content-type'], 'application/json')
    assert.match(body.fileName, /\.(jpg|jpeg|png|gif)$/i, 'extension must be accepted')
    assert.equal(typeof body.fileSize, 'number')
    assert.match(body.mimeType, /^image\//)
    uploads++
    return send(201, {
      file: { id: 7000 + uploads, path: `1/${uploads}-${body.fileName}`, fileSize: body.fileSize },
      uploadSignedUrl: `http://localhost:${server.address().port}/storage/${uploads}`
    })
  }

  if (url.pathname === '/api/events' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const slug = `vuejsberlin-${nextId++}`
    events.push({ id: nextId, slug, ...body })
    return send(201, events.at(-1))
  }

  const match = url.pathname.match(/^\/api\/events\/(.+)$/)
  if (match && req.method === 'PATCH') {
    const body = await readJsonBody(req)
    const existing = events.find(e => e.slug === match[1])
    if (!existing) return send(404, { message: 'not found' })
    Object.assign(existing, body)
    return send(200, existing)
  }

  send(404, { message: `no stub for ${req.method} ${url.pathname}` })
})

// Returns the raw body; multipart uploads are not JSON.
function readBody(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', c => (data += c))
    req.on('end', () => resolve(data))
  })
}

async function readJsonBody(req) {
  const raw = await readBody(req)
  return raw ? JSON.parse(raw) : {}
}

function runSync(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/sync-events.mjs'], {
      cwd,
      env: {
        ...process.env,
        OPENMEET_API: serverUrl,
        OPENMEET_EMAIL: 'bot@example.com',
        OPENMEET_PASSWORD: 'secret'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (out += d))
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(out))))
  })
}

let serverUrl
const tmp = await mkdtemp(join(tmpdir(), 'vuejs-sync-'))

try {
  await new Promise(resolve => server.listen(0, resolve))
  serverUrl = `http://localhost:${server.address().port}`

  await mkdir(join(tmp, 'events'), { recursive: true })
  await cp(join(ROOT, 'scripts'), join(tmp, 'scripts'), { recursive: true })
  const eventPath = join(tmp, 'events', '2099-01-13-vuejs-berlin.md')
  await writeFile(eventPath, '---\ntitle: "Vue.js // Berlin #999"\ndate: 2099-01-13T19:00:00+01:00\nslug: 2099-01-13-vuejs-berlin\n---\n\nDoors at 19:00.\n')

  // 1. create
  const first = await runSync(tmp)
  assert.match(first, /1 created/)
  assert.match(first, /#999/)
  assert.equal(events.length, 1)
  assert.equal(events[0].status, 'published')
  assert.equal(events[0].requireGroupMembership, false)
  assert.equal(events[0].startDate, '2099-01-13T18:00:00.000Z')
  assert.deepEqual(events[0].group, { id: 4242 })

  // openmeet_url is written back into the markdown
  let md = await readFile(eventPath, 'utf8')
  assert.match(md, /openmeet_url: https:\/\/platform\.openmeet\.net\/events\/vuejsberlin-\d+/)

  // 2. re-run is a no-op
  const second = await runSync(tmp)
  assert.match(second, /0 created, 0 updated, 0 cancelled, 1 unchanged/)
  assert.equal(events.length, 1)

  // 3. edit the markdown, re-run updates
  await writeFile(eventPath, md.replace('Doors at 19:00.', 'Doors at 19:15, bring snacks.'))
  const third = await runSync(tmp)
  assert.match(third, /1 updated/)
  assert.match(events[0].description, /bring snacks/)

  // 4. cancel by renaming the file
  await cp(eventPath, join(tmp, 'events', '2099-01-13-vuejs-berlin.cancelled.md'))
  await rm(eventPath)
  const fourth = await runSync(tmp)
  assert.match(fourth, /1 cancelled/)
  assert.equal(events[0].status, 'cancelled')

  // 5. cancelling again is a no-op
  const fifth = await runSync(tmp)
  assert.match(fifth, /0 created, 0 updated, 0 cancelled, 1 unchanged/)

  // 6. hero image: uploaded once on create, then never again while unchanged
  await mkdir(join(tmp, 'public', 'events'), { recursive: true })
  await writeFile(join(tmp, 'public', 'events', 'hero.png'), Buffer.from('PNG-VERSION-ONE'))
  await writeFile(
    join(tmp, 'events', '2099-02-10-vuejs-berlin.md'),
    '---\ntitle: "Vue.js // Berlin #1000"\ndate: 2099-02-10T19:00:00+01:00\nslug: 2099-02-10-vuejs-berlin\nhero: /events/hero.png\n---\n\nWith a hero.\n'
  )

  const uploadsBefore = uploads
  const sixth = await runSync(tmp)
  assert.match(sixth, /1 created/)
  assert.equal(uploads, uploadsBefore + 1, 'hero should be uploaded exactly once')
  const withHero = events.find(e => e.name.includes('#1000'))
  assert.deepEqual(withHero.image, { id: 7000 + uploads })
  // The bytes must actually reach storage, with the signed headers intact.
  assert.equal(storedUploads.length, 1)
  assert.equal(storedUploads[0].bytes, Buffer.byteLength('PNG-VERSION-ONE'))
  assert.equal(storedUploads[0].contentType, 'image/png')

  // The hash is recorded, so a re-run must not upload again
  const uploadsAfterCreate = uploads
  const seventh = await runSync(tmp)
  assert.equal(uploads, uploadsAfterCreate, 'unchanged hero must not be re-uploaded')
  assert.match(seventh, /0 created, 0 updated, 0 cancelled, 2 unchanged/)

  // Replacing the image re-uploads exactly once
  await writeFile(join(tmp, 'public', 'events', 'hero.png'), Buffer.from('PNG-VERSION-TWO'))
  const eighth = await runSync(tmp)
  assert.equal(uploads, uploadsAfterCreate + 1, 'changed hero should re-upload once')
  assert.match(eighth, /update 2099-02-10-vuejs-berlin\.md → \S+ \(\S+\) \+ image/)
  assert.match(eighth, /0 created, 1 updated/)
  assert.deepEqual(events.find(e => e.name.includes('#1000')).image, { id: 7000 + uploads })
  assert.equal(storedUploads[1].bytes, Buffer.byteLength('PNG-VERSION-TWO'))
  assert.equal(storedUploads[1].contentType, 'image/png')

  // And is stable from then on
  const uploadsAfterReplace = uploads
  await runSync(tmp)
  assert.equal(uploads, uploadsAfterReplace)

  // 7. an absolute hero URL is display-only and must not be uploaded
  await writeFile(
    join(tmp, 'events', '2099-03-10-vuejs-berlin.md'),
    '---\ntitle: "Vue.js // Berlin #1001"\ndate: 2099-03-10T19:00:00+01:00\nslug: 2099-03-10-vuejs-berlin\nhero: https://images.lumacdn.com/whatever.png\n---\n\nRemote hero.\n'
  )
  const uploadsBeforeRemote = uploads
  const ninth = await runSync(tmp)
  assert.equal(uploads, uploadsBeforeRemote, 'absolute hero must not be uploaded')
  assert.equal(events.find(e => e.name.includes('#1001')).image, undefined)

  // 8. a root-relative hero pointing at a missing file fails loudly
  await writeFile(
    join(tmp, 'events', '2099-04-10-vuejs-berlin.md'),
    '---\ntitle: "Vue.js // Berlin #1002"\ndate: 2099-04-10T19:00:00+01:00\nslug: 2099-04-10-vuejs-berlin\nhero: /events/missing.png\n---\n\nBroken hero.\n'
  )
  await assert.rejects(
    () => runSync(tmp),
    /hero points at \/events\/missing\.png but .* does not exist/
  )

  console.log('sync-events e2e: all checks passed')
} finally {
  server.close()
  await rm(tmp, { recursive: true, force: true })
}
