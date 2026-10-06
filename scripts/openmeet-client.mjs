// Minimal OpenMeet API client: auth with token refresh, plus the handful of
// endpoints the sync script needs. No dependencies — fetch is built in.

import { OPENMEET, requiredEnv } from './event-config.mjs'

const TENANT_HEADER = 'x-tenant-id'

export class OpenMeetClient {
  #api = OPENMEET.api
  #token = null
  #refreshToken = null
  #tokenExpires = 0
  #email = requiredEnv('OPENMEET_EMAIL')
  #password = requiredEnv('OPENMEET_PASSWORD')
  #groupId = null

  async #login() {
    const res = await this.#fetch('/api/v1/auth/email/login', {
      method: 'POST',
      body: JSON.stringify({ email: this.#email, password: this.#password })
    })
    const data = await this.#unwrap(res, 'login')
    this.#token = data.token
    this.#refreshToken = data.refreshToken
    this.#tokenExpires = data.tokenExpires ?? 0
  }

  async #refresh() {
    const res = await this.#fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.#refreshToken}` }
    })
    // A spent or expired refresh token is expected, not fatal — the caller
    // falls back to a fresh login. Don't overwrite the token with undefined.
    if (!res.ok) return false

    const data = await this.#unwrap(res, 'refresh')
    this.#token = data.token
    this.#refreshToken = data.refreshToken
    this.#tokenExpires = data.tokenExpires ?? 0
    return true
  }

  async #fetch(path, { method = 'GET', headers = {}, body } = {}) {
    const allHeaders = { [TENANT_HEADER]: OPENMEET.tenant, ...headers }
    // Only our JSON payloads carry a pre-serialised body. FormData must be left
    // alone so fetch can set multipart/form-data with the right boundary.
    if (typeof body === 'string') allHeaders['Content-Type'] = 'application/json'
    return fetch(`${this.#api}${path}`, { method, headers: allHeaders, body })
  }

  async #unwrap(res, label) {
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) {
      // Validation failures come back as { statusCode, message, errors: {...} },
      // where `errors` names the offending field. Without it a 422 is opaque.
      const fields = data.errors ? ` (${JSON.stringify(data.errors)})` : ''
      throw new Error(`${label} failed (${res.status}): ${data.message ?? text}${fields}`)
    }
    return data
  }

  async #authorizedFetch(path, options) {
    if (!this.#token || Date.now() >= this.#tokenExpires) {
      await this.#login()
    }
    let res = await this.#fetch(path, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${this.#token}` }
    })

    if (res.status !== 401) return res

    // Refresh tokens are single-use and rotate. One retry via refresh, then one
    // more via a fresh login if that refresh is spent or expired.
    if (await this.#refresh()) {
      res = await this.#fetch(path, {
        ...options,
        headers: { ...options?.headers, Authorization: `Bearer ${this.#token}` }
      })
      if (res.status !== 401) return res
    }

    await this.#login()
    return this.#fetch(path, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${this.#token}` }
    })
  }

  async request(path, options) {
    return this.#unwrap(await this.#authorizedFetch(path, options), path)
  }

  get categories() {
    return this.request('/api/categories')
  }

  listGroupEvents() {
    return this.request(`/api/groups/${OPENMEET.groupSlug}/events`)
  }

  getEvent(slug) {
    return this.request(`/api/events/${slug}`)
  }

  getGroup(slug = OPENMEET.groupSlug) {
    return this.request(`/api/groups/${slug}`)
  }

  /**
   * The group's numeric id, looked up once per client instance. Hardcoding it
   * would break silently if the group were ever recreated with a new id.
   */
  async groupId() {
    this.#groupId ??= (await this.getGroup()).id
    return this.#groupId
  }

  createEvent(payload) {
    return this.request('/api/events', { method: 'POST', body: JSON.stringify(payload) })
  }

  patchEvent(slug, payload) {
    return this.request(`/api/events/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    })
  }

/**
 * Upload a file and return its id, for attaching as an event image.
 *
 * The hosted platform runs the `s3-presigned` driver, so this is a two-step
 * flow rather than a single multipart POST (the multipart example in
 * `docs/file-uploading.md` only applies to the self-hosted `local` driver):
 *
 *   1. POST /api/v1/files/upload with JSON metadata, which reserves the object
 *      and returns a presigned URL (valid 1 hour) plus the stored file row.
 *   2. PUT the raw bytes straight to that URL. `Content-Type` and
 *      `Content-Length` are part of the signature, so both must match exactly.
 *
 * There is no server-side dedupe: every call inserts a new file row, so the
 * caller is responsible for not uploading the same image twice.
 */
async uploadFile(bytes, filename, mimeType) {
  const fileSize = bytes.length

  const res = await this.#authorizedFetch('/api/v1/files/upload', {
    method: 'POST',
    body: JSON.stringify({ fileName: filename, fileSize, mimeType })
  })
  const body = await this.#unwrap(res, 'file upload')

  const id = body?.file?.id
  const signedUrl = body?.uploadSignedUrl
  if (!id || !signedUrl) {
    throw new Error(
      `file upload did not return an id and presigned URL: ${JSON.stringify(body)}`
    )
  }

  // Deliberately no Authorization or tenant header: this goes straight to
  // object storage, and extra headers would invalidate the signature.
  const put = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'Content-Length': String(fileSize) },
    body: bytes
  })
  if (!put.ok) {
    throw new Error(
      `uploading ${filename} to storage failed (${put.status} ${put.statusText}). ` +
        `The reserved file row ${id} may be orphaned; re-running will reserve a new one.`
    )
  }

  return id
}
}

export function eventUrl(slug) {
  return `${OPENMEET.platform}/events/${slug}`
}
