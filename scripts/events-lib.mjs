// Reading events/*.md: just enough YAML frontmatter to drive the tooling.
// The repo has no YAML dependency, and the frontmatter we care about is a flat
// list of scalars, so a small parser keeps the scripts dependency-free.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const EVENTS_DIR = join(ROOT, 'events')

export async function readEventFiles() {
  const names = await readdir(EVENTS_DIR)
  return names
    .filter(name => name.endsWith('.md'))
    .sort()
    .map(fileName => join(EVENTS_DIR, fileName))
}

export async function readEvent(path) {
  const raw = await readFile(path, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) throw new Error(`No frontmatter in ${path}`)

  const frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    frontmatter[kv[1]] = value
  }

  return { path, fileName: path.split('/').pop(), frontmatter, body: raw.slice(match[0].length) }
}

export function isCancelled(fileName) {
  return fileName.includes('.cancelled')
}

// The second Tuesday of a month, at 19:00 local time. Mirrors useSecondTuesday.ts,
// which the site uses to decide whether an event is missing for the current month.
export function secondTuesday(year, month) {
  const first = new Date(year, month, 1)
  const firstDay = first.getDay()
  const offset = firstDay < 2 ? 3 - firstDay : firstDay === 2 ? 0 : 10 - firstDay
  return new Date(year, month, offset + 7)
}

// The highest "#N" in any event title — the repo is the source of truth for numbering.
export function highestMeetupNumber(events) {
  let highest = 0
  for (const { frontmatter } of events) {
    const found = (frontmatter.title ?? '').match(/#(\d+)/)
    if (found) highest = Math.max(highest, Number(found[1]))
  }
  return highest
}
