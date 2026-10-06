# Vuejs//Berlin

reachable at https://vuejs.berlin

Built with [Vitepress](https://vitepress.dev).

## Development

To check out the repo, install all dependencies:

```sh
git checkout https://github.com/VuejsBerlin/new.vuejs.berlin.git vuejs.berlin
cd vuejs.berlin
# in case you do not have pnpm installed yet:
npm i -g pnpm
pnpm i
```

To run in dev mode:


```sh
pnpm dev
```

Most theme related files can be found in .vitepress/theme.

## Events

Every meetup is a markdown file in `events/`. **These files are the source of
truth** — the site renders them, and the OpenMeet event is generated from them.
Luma has no free API, so Luma events are still created by hand; the
`luma_url` frontmatter field just points at them.

To publish a new meetup:

```sh
pnpm event:new                      # scaffold the next one (second Tuesday, next number)
# ...edit the markdown, add luma_url once the Luma event exists...
pnpm event:sync                     # push to OpenMeet
```

`pnpm event:sync --dry-run` prints what it would do without touching anything.

### File names

Event file names follow the convention used since 2025 — **year and month, no
day**:

```
events/2026-10-vuejs-berlin.md                    regular meetup
events/2026-11-vuejs-berlin-hackntell.md         special edition
events/2026-12-vuejs-berlin.cancelled.md          cancelled
```

Every third meetup is a Hack'n'Tell, which gets a `-hackntell` suffix.
`pnpm event:new` takes an optional date and edition:

```sh
pnpm event:new 2026-11-10            # regular meetup
pnpm event:new 2026-11-10 hackntell  # special edition
```

Note that the `slug:` frontmatter still carries the day
(`2026-11-10-vuejs-berlin`), matching every existing event file. That is
deliberate and harmless — **the URL actually comes from the markdown file name,
not `slug:`**, so the two don't have to agree. Renaming a file does change its
URL, though, so avoid renaming published events.

### Cover images

Drop the image in `public/events/` *before* running `pnpm event:new`, and the
generated file picks up a `hero:` automatically — no wiring needed. A
`-<edition>` suffix in the image name also selects the special edition, so
`public/events/2026-11-vuejs-berlin-hackntell.png` alone produces a Hack'n'Tell
event.

The naming mirrors the markdown: `public/events/2026-10-vuejs-berlin.png` for a
regular meetup, `...-hackntell.png` for the special edition. `hero:` values are
root-relative (`/events/2026-10-vuejs-berlin.png`), which VitePress serves from
`public/` and which `pnpm event:sync` uploads to OpenMeet.

An **absolute** `hero` (e.g. `https://images.lumacdn.com/...`) is display-only —
the sync will not re-host someone else's image, and the OpenMeet event gets no
cover. Several older event files still point at Luma's CDN.

OpenMeet does not deduplicate uploads — every request inserts a new file row. To
keep re-runs from piling up copies, the sync records the sha256 of the file it
last uploaded in `hero_sha256` and only re-uploads when the local file actually
changes. Both `openmeet_url` and `hero_sha256` are tool-managed; don't hand-edit
them.

Two OpenMeet upload limits are worth knowing: cover images must be `png`, `jpg`,
`jpeg` or `gif` (**`webp` and `avif` are rejected**), and must be under 5 MB.

If a root-relative `hero` points at a file that doesn't exist, the sync fails
loudly rather than creating an event without an image.

### The homepage calendar

`OpenMeetCalendar.vue` lists the next few events straight from OpenMeet. They are
fetched **at build time** by `openmeet.data.mts`, so the page makes no runtime API
calls. If OpenMeet is unreachable or has nothing scheduled, the component falls
back to a link to the Luma calendar rather than breaking the page.

The list reflects whatever OpenMeet served *during that build*, so rebuild after
`pnpm event:sync` creates events. Nothing is cached between builds.

> **Note for anyone touching `openmeet.data.mts`:** `load()` must return the
> data itself, not a `{ data }` wrapper. VitePress serialises the return value
> straight into `export const data`, which is why `createContentLoader` returns a
> bare array. Returning a wrapper makes the component receive an object, so
> `events.length` is `undefined` and the list silently never renders — no
> error, no warning. There's a regression test for this.

### Frontmatter

| Field | Meaning |
|-------|---------|
| `title` | Event title. The `#N` here defines the meetup number for future events. |
| `date` | Start time. Only the date and `19:00` are read; the UTC offset is ignored and Europe/Berlin is assumed (several older files carry a stale offset). |
| `slug` | Legacy. Carries the day, unlike the file name. Not used for URLs — VitePress derives the path from the file name. Kept for consistency with existing files. |
| `hero`, `hero_alt` | Cover image. Use a root-relative `/events/...` path for images we host; absolute URLs are display-only. |
| `luma_url` | Link to the hand-made Luma event. |
| `openmeet_url` | Written automatically by `pnpm event:sync`. Maps the file to its OpenMeet event. |
| `hero_sha256` | Written automatically by `pnpm event:sync`. Sha256 of the hero image last uploaded. |
| `notice` | Optional line shown for cancelled or changed events. |

### Cancelling an event

Rename the file to add `.cancelled` before the extension, then sync:

```sh
git mv events/2026-11-10-vuejs-berlin.md events/2026-11-10-vuejs-berlin.cancelled.md
pnpm event:sync
```

### OpenMeet credentials

`pnpm event:sync` needs an OpenMeet account. Copy `.env.example` to `.env` and
fill it in — `.env` is gitignored.

**Use a dedicated bot account, not your personal login.** Create one through the
normal sign-up form at <https://platform.openmeet.net>. OpenMeet's own
[guidance on programmatic access](https://github.com/OpenMeet-Team/openmeet-api/blob/main/docs/auth.md#programmatic--automation-access)
says to do exactly that, and the reason is isolation: a bot's credentials can be
rotated or revoked without disturbing anyone's browser session, and a script
running unattended acts as whoever owns the account.

There is nothing special about such an account — it is an ordinary account with
an email and password. OpenMeet has **no API keys or personal access tokens**;
automation logs in as a user and refreshes the returned token. The group id and
tenant id are resolved or hardcoded in `scripts/event-config.mjs`; venue,
schedule and capacity live there too.

If you signed up with an AT Protocol handle, note that OpenMeet accepts
`PATCH /api/v1/auth/me` with a password for passwordless accounts. That works,
but it puts a password on your *personal* account — prefer a separate one. The
alternative, ATProto service auth via a Bluesky app password, is documented in
the link above but not implemented in the tooling.

## Tests

```sh
pnpm test
```

Covers the frontmatter parser, the Europe/Berlin time conversion, the API
client's token refresh, the event naming conventions (file name vs. slug,
edition inference), the build-time data loader (including a regression guard for
the `{ data }` wrapper trap), and a full create → edit → cancel → hero-image
sync against a stubbed OpenMeet API.
