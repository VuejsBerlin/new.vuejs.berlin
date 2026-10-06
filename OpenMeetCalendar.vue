<script setup lang="ts">
import { data as events } from './openmeet.data'

// Upcoming events, resolved at build time from OpenMeet. If that fetch failed
// the list is empty and we point people straight at the Luma calendar instead.
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <details open>
    <summary>
      Show upcoming events from the OpenMeet calendar
    </summary>

    <ol v-if="events.length" class="openmeet-calendar">
      <li v-for="event in events" :key="event.slug">
        <a :href="event.url" target="_blank" rel="noopener">{{ event.name }}</a>
        <span class="openmeet-calendar-date">{{ formatDate(event.startDate) }}</span>
        <span v-if="event.attendeesCount" class="openmeet-calendar-attendees">
          {{ event.attendeesCount }} going
        </span>
      </li>
    </ol>

    <p v-else class="openmeet-calendar-empty">
      No upcoming events listed. See the
      <a href="https://platform.openmeet.net/groups/vuejs-berlin" target="_blank" rel="noopener">calendar on OpenMeet</a>
      for the latest.
    </p>

    <p class="calendar-fallback">
      <a href="https://lu.ma/vuejs_berlin" target="_blank" rel="noopener">Prefer Luma?</a>
    </p>
  </details>
</template>
