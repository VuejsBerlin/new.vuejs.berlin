# Architecture

## Project Overview

Vuejs//Berlin community website — a **fully static VitePress site** (Vue 3) for Berlin's monthly Vue.js meetup. The site lists events, newsletters, and community info. It was previously a Gridsome (Vue 2) site powered by Contentful CMS; the Gridsome code is retained in `src/` for historical reference but is **not part of the active build**.

## Directory Layout & Module Responsibilities

```
.
├── .vitepress/                  # VitePress config + custom theme
│   ├── config.mts               # Site metadata, favicon, GoatCounter analytics
│   └── theme/                   # Custom VitePress theme (replaces default)
│       ├── index.ts             # Theme entry: registers Layout.vue + global CSS
│       ├── Layout.vue           # Dual-mode layout (homepage hero vs. default page)
│       ├── components/
│       │   ├── Header.vue       # Page header with logo + optional menu toggle
│       │   ├── SideBar.vue      # Slide-in sidebar navigation
│       │   ├── Logo.vue         # Animated SVG logo (stroke-dash progress 0–100)
│       │   ├── SiteFooter.vue   # Footer with attribution
│       │   └── SpecialEffectWallpaper.vue  # CSS flicker overlay (Hacktoberfest)
│       ├── assets/
│       │   ├── main.css             # Global styles
│       │   ├── animations.css       # Reusable keyframe animations
│       │   ├── wallpaper.jpg        # Homepage hero background
│       │   ├── hacktoberfest_wallpaper.jpg  # Used by SpecialEffectWallpaper.vue
│       │   ├── wallpaper-preview.jpg        # Wallpaper thumbnail preview
│       │   └── no-name-37.light.{otf,woff,woff2}  # Custom header font
│
├── index.md                     # Home page — uses `home: true` frontmatter
├── events.md                    # Events listing page — renders Events.vue
├── newsletters.md               # Newsletter archive page — renders Newsletters.vue
├── events/                      # Event markdown files (one per meetup)
├── public/events/               # Cover images, served at /events/<file> and uploaded
│                                # to OpenMeet by `pnpm event:sync`
├── newsletters/                 # Newsletter markdown files (markdown + occasional image assets)
├── vuejsberlin.svg              # Site SVG logo/favicon source
├── favicon.png                  # Browser tab icon
├── ypog.webp                    # YPOG sponsor logo
├── wikimedia.*                  # Wikimedia sponsor logos (svg + png variants)
├── 1024px-Wikimedia-logo.svg_-1.png  # Wikimedia logo copy
│
├── Events.vue                   # Past + future event lists via useEvents()
├── NextEvent.vue                # Featured next-event card via useEvents()
├── OpenMeetCalendar.vue         # Upcoming events list from openmeet.data
├── Newsletters.vue              # All newsletters from newsletters.data
├── useEvents.ts                 # Composable: sorts/partitions events from events.data
├── useSecondTuesday.ts          # Utility: computes next "second Tuesday" date
├── events.data.mts              # VitePress content loader: events/*.md ({ excerpt: true })
├── openmeet.data.mts            # VitePress data loader: upcoming events from OpenMeet API
├── newsletters.data.mts         # VitePress content loader: newsletters/*.md
├── events-archive.json          # ~366 KB snapshot dump from Meetup GraphQL API
├── events2md.mjs                # One-off script: events-archive.json → events/*.md
│
├── scripts/                     # OpenMeet event tooling (dependency-free Node)
│   ├── event-config.mjs         # Venue, group/tenant ids, schedule, event defaults
│   ├── event-naming.mjs         # File name / slug / title / body conventions, cover
│   │                            # image lookup — pure, so it can be tested directly
│   ├── events-lib.mjs           # events/*.md frontmatter parsing, second-Tuesday logic
│   ├── datetime.mjs             # 19:00 Europe/Berlin → UTC, DST-safe
│   ├── openmeet-client.mjs      # OpenMeet API auth (JWT + refresh), event CRUD,
│   │                            # and cover image upload (presigned two-step)
│   ├── new-event.mjs            # `pnpm event:new` — scaffold the next event file
│   ├── sync-events.mjs          # `pnpm event:sync` — events/*.md → OpenMeet,
│   │                            # incl. hero image upload keyed on hero_sha256
│   ├── events.test.mjs          # node:test unit tests
│   ├── event-naming.test.mjs    # file naming and edition inference
│   ├── openmeet-loader.test.mts # data loader tests (incl. the bare-array guard)
│   └── sync-events.e2e.mjs      # drives the real sync script against a stubbed API
│
├── src/                         # LEGACY Gridsome (Vue 2) codebase — NOT IN ACTIVE BUILD
│   ├── main.js                  # Gridsome client-api entry
│   ├── layouts/                 # Default, LandingPage, SpecialEvent layouts
│   ├── pages/                   # Index, Events, About, Newsletters pages
│   ├── templates/               # Gridsome templates: ContentfulEvent, *Newsletter
│   ├── components/              # Event, NestedEvent, NewsletterView, NewsletterNavigation.vue
│   └── lib/                     # date.js (dateFmt), contentful-rich-text-vue-renderer
│
└── package.json                 # Scripts: dev/build/preview via vitepress
```

## Key Types & Data Shapes

### Event frontmatter (YAML in `events/*.md`)
```yaml
title: string          # e.g. "Vue.js // Berlin"
date: string           # ISO-8601, e.g. "2025-01-14T19:00:00+02:00"
slug: string           # Legacy. Carries the day, unlike the file name — VitePress
                       # derives page URLs from the file name, not from this
hero: string           # Optional hero image. Root-relative (`/events/x.png`) resolves
                       # against `public/` and is uploaded to OpenMeet; absolute URLs
                       # (Luma's CDN) are display-only
hero_alt: string       # Alt text for hero image
luma_url: string       # Optional lu.ma RSVP link (Luma events are created by hand)
openmeet_url: string   # OpenMeet event link; written by `pnpm event:sync`
hero_sha256: string    # Sha256 of the hero image last uploaded; written by `pnpm event:sync`
notice: string         # Optional notice shown for cancelled or changed events
```
The `Event` type alias in `useEvents.ts` is derived from VitePress's content loader return type: `type Event = typeof events[number]`.

### Event file names and slugs

These two conventions differ on purpose, and conflating them is an easy mistake:

| | Format | Example |
|---|---|---|
| File name | `YYYY-MM-vuejs-berlin[-<edition>].md` | `2026-11-vuejs-berlin-hackntell.md` |
| `slug:` | `YYYY-MM-DD-vuejs-berlin` | `2026-11-10-vuejs-berlin` |

File names dropped the day in 2025; older files (`2017-02-21-vue-meetup.md`) carry it in both. The `slug:` field keeps the day throughout and is **inert** — VitePress derives page URLs from the markdown file name, so the two do not have to agree. Renaming a published file therefore changes its URL; avoid it.

Special editions append a suffix (`-hackntell`); cancellations append `.cancelled`
before the extension, which `useEvents.ts` keys off.

`event-naming.mjs` holds these rules as pure functions, and `pnpm event:new` infers the edition from the cover image name — dropping
`public/events/2026-11-vuejs-berlin-hackntell.png` in place is enough to generate a Hack'n'Tell event.

### Component Props (active VitePress theme)
| Component | Props |
|-----------|-------|
| `Header.vue` | `title: string`, `withMenu?: boolean`, `hintMenu?: boolean` |
| `SideBar.vue` | `width?: number` |
| `Logo.vue` | `progress?: number` (0–100, drives stroke-dash animation) |

### Legacy domain model (Gridsome/Contentful, inactive)
- **ContentfulEvent**: title, path, date, address, headerImage, details, talks (each with title, details, speakers)
- **ContentfulNewsletter**: title, path, slug, details (rich-text JSON)
- **Rich text renderer**: transforms Contentful JSON AST → Vue VNodes (block types: headings, paragraphs, lists, quotes, images, hyperlinks, embedded entries/assets)

## Control Flow

### Build-time flow
```
vitepress build
  ├── .vitepress/config.mts           ← Site config
  ├── .vitepress/theme/index.ts       ← Theme registration
  │     └── Layout.vue                ← Custom layout component
  ├── events.data.mts                 ← createContentLoader('events/*.md')
  ├── newsletters.data.mts            ← createContentLoader('newsletters/*.md')
  ├── index.md  → Layout.vue (home mode)
  ├── events.md → Layout.vue (default mode) → Events.vue → useEvents() → events.data
  └── newsletters.md → Layout.vue → Newsletters.vue → newsletters.data
```

### Runtime flow (client)
1. **VitePress bootstraps** with custom theme from `.vitepress/theme/index.ts`
2. **Layout.vue** reads `frontmatter` via `useData()` to decide rendering mode:
   - `frontmatter.home === true` → full-viewport hero with wallpaper, Logo, SiteFooter, Content below
   - otherwise → standard layout with PageHeader, SideBar, hero image (if `frontmatter.hero`), Content
3. **Sidebar toggle**: local `ref(withMenu)` in Layout.vue, passed to Header/SideBar via props/events. CSS `transform: translate(260px)` slides content right.
4. **Pages** (Events, Newsletters) import composables/data at module scope; VitePress resolves them at build time.

## Data Flow

```
                     BUILD TIME                      |        RUNTIME
                                                     |
events/*.md ──→ events.data.mts ──→ useEvents() ────→ Events.vue
  (YAML fm)      (content loader)     sort+split       NextEvent.vue
                                       past/future/next
                                                     |
newsletters/*.md ──→ newsletters.data.mts ───────────→ Newsletters.vue
  (YAML fm)           (content loader)                   .reverse() at render
                                                     |
events-archive.json ──→ events2md.mjs ──→ events/*.md
  (Meetup dump)          (one-off script)

events/*.md ──→ new-event.mjs (scaffold) / sync-events.mjs ──→ OpenMeet API
                 writes openmeet_url + hero_sha256 back into frontmatter
                                                 │
public/events/*.png ─────────────────────────────┘  (uploaded only when the
                                                     local file changed)

OpenMeet API ──→ openmeet.data.mts ──→ OpenMeetCalendar.vue
  (embed endpoint,   (data loader, must      (build-time fetch,
   no caching)        return a bare array)    no runtime call)
```

**Key principle: zero runtime API calls.** All data is loaded statically at build time. The only external runtime request is GoatCounter analytics (`gc.zgo.at/count.js`). The homepage's upcoming-events list is a build-time fetch from OpenMeet (`openmeet.data.mts`), not a runtime call — the earlier lu.ma iframe was the one exception and has been removed.

The calendar therefore reflects whatever OpenMeet served *during that build*. Rebuild after `pnpm event:sync` to see new events; nothing is cached between builds.

Events are **written** in git as `events/*.md` and pushed **out** to OpenMeet by `pnpm event:sync`; OpenMeet is not a source of truth. Luma has no free API, so Luma events are still created by hand and linked via `luma_url`.

### VitePress data loader contract

A `.data.<ext>` file's `load()` must **return the data itself**, not a `{ data }`
wrapper. VitePress's data plugin does:

```js
const data = await load(watchedFiles || [])
const result = `export const data = JSON.parse(${JSON.stringify(JSON.stringify(data))})`
```

which is why `createContentLoader` returns a bare array. Returning
`{ data: [...] }` makes the component receive an object, so `events.length` is
`undefined` and a `v-if="events.length"` list renders as empty forever — with no
error anywhere. `scripts/openmeet-loader.test.mts` guards this.

There is **no on-disk cache** of data-loader results; `.vitepress/cache` only
holds Vite's dependency pre-bundling, and `dist/hashmap.json` is a dead-link
metadata hash.

There is **no shared reactive store** (no Pinia, Vuex, or provide/inject). The only globally reactive state is VitePress's `useData()` (site metadata, page, frontmatter). All component state is local `ref`/`computed`.

## Design Decisions & Rationale

1. **VitePress over Gridsome**: The migration from Gridsome (Vue 2) to VitePress (Vue 3) simplified the stack significantly — no GraphQL data layer, no Contentful dependency, no build-time CMS coupling. Content is now plain markdown with YAML frontmatter, editable without a CMS.

2. **Content loaders for data**: `events.data.mts` and `newsletters.data.mts` use VitePress's `createContentLoader` API, which globs markdown files at build time and creates typed data arrays. This avoids a database, API, or static JSON generation step.

3. **Dual-mode Layout.vue**: Instead of separate layouts for homepage vs. inner pages, a single `Layout.vue` switches on `frontmatter.home`. This keeps the theme surface area small (one entry in `index.ts`) while supporting the distinct visual design.

4. **Legacy code preserved in `src/`**: The old Gridsome codebase is kept as reference but excluded from the build. The `src/` directory has no imports from the active VitePress code.

5. **No state management library**: The site is a static content display — there's no user session, form state, or complex client state. Local `ref` and `useData()` suffice. The `useEvents()` function is not a shared singleton composable; each consumer gets a fresh result (memoization is unnecessary since the underlying data is static).

6. **One-off migration script**: `events2md.mjs` converts `events-archive.json` (Meetup.com GraphQL dump) into individual markdown files. This was run once during migration and serves as documentation of the data pipeline.

7. **GoatCounter for analytics**: Chosen as a privacy-friendly, lightweight alternative to Google Analytics. Injected via a `<script>` tag in `.vitepress/config.mts`.

8. **A dedicated bot account for OpenMeet, not a personal login**: OpenMeet has no API keys or personal access tokens — automation authenticates as a user and refreshes the returned JWT. Their own docs recommend a dedicated account, and the reason is isolation rather than capability: rotating or revoking a bot's credentials must not disturb a human's browser session, and a script running unattended should not act as a person. Note that a group role is *not* required for the sync — see the caveat below.

## Known Caveats: OpenMeet

**Anyone can create an event in our group.** As of `openmeet-api` 1.5.0, `POST /api/events` is guarded only by:

```
@Permissions({ context: 'user', permissions: [UserPermission.CreateEvents] })
@UseGuards(JWTAuthGuard, PermissionsGuard)
```

`context: 'user'` resolves only the platform role's permission list; that branch of `permissions.guard.ts` performs no group lookup. There is no globally registered guard either — `interceptors.module.ts` registers only interceptors and filters. Meanwhile the seeded `user` role ships with `CreateEvents`, so **any registered OpenMeetsignup can post an event into the `vuejs-berlin` group** without joining it or holding any group role.

The permission check itself is sound, so this is a *missing check* rather than a broken one. The chain was traced end to end, because a bug anywhere in it would have meant nobody — including us — could create events via the API:

1. `PermissionSeedService` inserts one `permissions` row per `UserPermission` enum value, `name: 'CREATE_EVENTS'`.
2. `RoleSeedService` grants the default `user` role `CreateEvents` (alongside `AttendEvents`, `CreateGroups`, `JoinGroups`, …) and resolves those enum names to `PermissionEntity` rows via `permissionRepository.find({ where: [...] })`, assigning real entities to `role.permissions` — so the `@ManyToMany` join table is populated with entities, not bare strings.
3. `userService.findById` loads `relations: ['role', 'role.permissions', 'interests']`, so the relation is hydrated rather than lazy.
4. `AuthService.getUserPermissions` returns `user.role.permissions`, i.e. `PermissionEntity[]` each carrying a `name` string.
5. `hasRequiredPermissions` compares `p.name === required` with `every`/`some` — correct given that shape, and called from four sites (attendee, event→group fallback, `context: 'group'`, `context: 'user'`).

Two things I could **not** determine from source, both benign for us:

- `createRoleIfNotExists` only inserts a role if absent. If the hosted instance was seeded from an older revision, its `user` role could in principle lack `CREATE_EVENTS` even though current source includes it. In practice it must have it, since the product's entire purpose is letting ordinary users create events through the web UI.
- `getUserPermissions` merges in `userService.getUserPermissions(userId)` alongside the role entities. If that returns bare strings, the `Set` dedupe mixes shapes and `p.name` is `undefined` for those entries — harmless, they simply never match.

The asymmetry looks unintentional rather than by design: the codebase does express group-level authorization elsewhere — `PATCH /api/groups/:slug` uses `context: 'group'` with `GroupPermission.ManageGroup`, and that branch does enforce membership.

**Confirmed empirically (2026-10-07).** A freshly registered bot account that was *not* a member of `vuejs-berlin` successfully created an event in the group via `POST /api/events`, and the event was immediately visible to an unrelated logged-in account. So the reading above is right, and worth reporting upstream.

### Updates and cancellations are authorized by ownership

`PATCH` and `DELETE` on `/api/events/:slug` both use `context: 'event'`, whose branch falls back to `if (event.user.id === user.id) return`. Since the sync creates the events, the bot account owns them and can update or cancel them without any group role. That is what makes `pnpm event:sync` work end to end.

Note a quirk in that branch: when it consults the group it checks a **hardcoded** `['MANAGE_EVENTS']` rather than the permission the decorator asked for. So for `DELETE`, whose decorator requires both `ManageEvent` and `DeleteEvent`, a group member holding only `MANAGE_EVENTS` would still pass via this fallback. Not something we rely on — the bot uses the ownership path — but worth knowing before giving any account group admin rights.

Consequences for this project:

- This is a reason to keep events duplicated on Luma rather than treating OpenMeet as a system of record. A stranger could add an event to our group's calendar and it would surface in `OpenMeetCalendar.vue`.
- It is **not** a reason to skip the bot account. Event *creation* ignores group roles entirely, so promoting the bot to group admin would buy nothing for creating and updating events — those go through the ownership path. A group role would only matter if we later automated member or group management. Note the three pre-existing events (#106–#108) are owned by a different account, so the bot **cannot** edit them; that is a separate constraint from the missing check above.
- `DELETE /api/events/:slug` uses `context: 'event'`, whose last-resort branch accepts the event's creator. So an event created for testing can always be removed by the same account.

**The tenant id is undocumented.** Every request needs `x-tenant-id`, and OpenMeet offers no endpoint to look up your own. `scripts/event-config.mjs` hardcodes `lsdfaopkljdfs`, which `docs/auth.md` describes only as the seeded *local dev* tenant — it works against the hosted instance today, but nothing guarantees that. This is the single most fragile value in the setup; by contrast the group id is resolved from its slug at runtime.

**The OpenAPI spec omits request bodies.** 32 write endpoints, including `POST /api/events`, have no `requestBody` in `api.openmeet.net/docs-json`. The payload shape was taken from the source DTO (`src/event/dto/create-event.dto.ts`). Integrating against the published spec alone is not sufficient.

**`sourceType` and `sourceUrl` are accepted but not persisted.** `sync-events.mjs` sends both on create (`sourceType: 'web'`, `sourceUrl` from `luma_url`), and `CreateEventDto` declares them, but a created event reads back `null` for both. Every pre-existing event in the group is likewise `sourceType: null`. Either the write is dropped or the response doesn't serialise the column — we can't tell which without database access, and the API doesn't expose it. Treat these two payload fields as no-ops; they're kept only because the DTO accepts them and they document intent if OpenMeet ever starts honouring them.

**Cover images.** Hero images live in `public/events/` and are referenced root-relative (`hero: /events/x.png`), which both serves correctly on the site and identifies the file as ours to upload. `sync-events.mjs` reads it, uploads it via `openmeet-client.mjs`, then attaches `{ id }` as the event's `image` (honoured on create at `em.service.ts:236` and on patch at `:717`, since `UpdateEventDto extends PartialType(CreateEventDto)`).

Uploading is a **two-step** flow, not a single multipart POST:

1. `POST /api/v1/files/upload` with JSON `{ fileName, fileSize, mimeType }`, which reserves the object and returns `{ file, uploadSignedUrl }` — a presigned URL valid for one hour.
2. `PUT` the raw bytes to that URL, with `Content-Type` and `Content-Length` matching exactly, since both are part of the signature. No `Authorization` or tenant header goes to storage.

This trips people up: `docs/file-uploading.md` documents a single `multipart/form-data` POST, but that only applies to the self-hosted **`local`** driver. The hosted instance runs `s3-presigned` — `src/file/file.module.ts` imports only `FilesS3PresignedModule`, and `file.config.ts` defaults `FILE_DRIVER` to `S3_PRESIGNED`. Sending multipart to the hosted API yields a bare `422 Unprocessable Entity Exception`, because the DTO expects three JSON fields that a multipart body doesn't provide. Getting a usable error out of that required surfacing the `errors` object in `#unwrap`, since NestJS validation failures carry the offending field names there.

Other upload constraints from `FilesS3PresignedService.create`:

- **Extensions are restricted** to `jpg|jpeg|png|gif`. `webp` and `avif` are rejected, so `CONTENT_TYPES` in `sync-events.mjs` only offers the four accepted ones and fails locally with a clear message rather than burning an API call.
- **Size limit** is `AWS_S3_MAX_FILE_SIZE`, default 5 MB. Exceeding it returns `413 Payload Too Large` rather than `422`.
- **No deduplication**: every call inserts a new row, which is why `hero_sha256` gates re-uploads.
- If step 2 fails after step 1 succeeded, the reserved row is orphaned; re-running reserves a fresh one. The error message says so.

The stored `path` is a presigned GET URL (`FileType` signs it with a one-hour expiry) pointing at DigitalOcean Spaces. Note that the *embed* endpoint's `imageUrl` field instead reports `https://api.openmeet.net/<key>`, which 404s — that appears to be a gap in their embed DTO rather than something we cause, and it affects the images set up through the web UI identically. Verified round-trip: the bytes served from storage are identical to the local file.

Two things worth knowing about that endpoint:

- The response is `{ file: { id, ... }, uploadSignedUrl }` — both parts are needed; the file id alone is not enough.
- **No deduplication**: every call inserts a row, so the sync records the uploaded file's sha256 in `hero_sha256` and only re-uploads when the local bytes change.

An absolute `hero` (Luma's CDN) is left display-only — the sync won't re-host an image it doesn't own, so such events get no image on OpenMeet.

## External Dependencies

| Package | Role |
|---------|------|
| `vitepress` `1.2.3` | Static site generator (Markdown → HTML, Vue 3 SFC compilation) |
| `vue` `^3.4.31` | UI framework (template rendering, reactivity) |
| `@vueuse/core` `^10.11.0` | `useImage` composable for progressive background image loading |
| GoatCounter | Privacy-friendly analytics (loaded via `<script>` in config) |

**Package manager**: pnpm. **Build tooling**: VitePress uses Vite internally.

## Entry Points

| Mode | Command | Entry |
|------|---------|-------|
| Dev server | `pnpm dev` → `vitepress dev` | `.vitepress/config.mts` + theme `index.ts` |
| Production build | `pnpm build` → `vitepress build` | Same; outputs to `.vitepress/dist/` |
| Preview | `pnpm preview` | Serves `.vitepress/dist/` locally |

Legacy Gridsome entry (not wired to any npm script): `src/main.js` registers global components/layouts and exports a Gridsome `client-api` function.