<script setup lang="ts">
import { computed } from 'vue'
import useEvents from './useEvents'
import secondTuesday from './useSecondTuesday'

const { nextEvent, cancelledEvents } = useEvents()

const now = new Date()
const expectedDate = secondTuesday()
const monthName = expectedDate.toLocaleString('en-US', { month: 'long' })

const firstUpcomingCancelled = computed(() =>
  cancelledEvents
    .filter(e => new Date(e.frontmatter.date) > now)
    .sort((a, b) => a.frontmatter.date.localeCompare(b.frontmatter.date))
    [0]
)

const cancelledNext = computed(() => {
  if (!firstUpcomingCancelled.value) return undefined
  if (!nextEvent) return firstUpcomingCancelled.value
  const cd = new Date(firstUpcomingCancelled.value.frontmatter.date)
  const nd = new Date(nextEvent.frontmatter.date)
  return cd <= nd ? firstUpcomingCancelled.value : undefined
})

const confirmedNext = computed(() => {
  if (!nextEvent || cancelledNext.value) return undefined
  const d = new Date(nextEvent.frontmatter.date)
  return d.getMonth() === expectedDate.getMonth()
    && d.getFullYear() === expectedDate.getFullYear()
    ? nextEvent
    : undefined
})
</script>

<template>
  <div class="next-event" v-if="confirmedNext">
    <header>
      <a :href="confirmedNext.url">{{ confirmedNext.frontmatter.title }}</a>
      <span>{{ confirmedNext.frontmatter.date.split('T')[0] }}</span>
    </header>
    <div class="notice" v-if="confirmedNext.frontmatter.notice">
      {{ confirmedNext.frontmatter.notice }}
    </div>
    <div class="hero" v-if="confirmedNext.frontmatter.hero">
      <img :src="confirmedNext.frontmatter.hero" :alt="confirmedNext.frontmatter.hero_alt || `${confirmedNext.frontmatter.title} hero image`" />
    </div>
    <div class="rendered-markdown" v-html="confirmedNext.excerpt" />
    <footer>
      <a :href="confirmedNext.frontmatter.luma_url || confirmedNext.url">Go to Event Page</a>
    </footer>
  </div>

  <div class="next-event cancelled" v-else-if="cancelledNext">
    <header>
      <span class="cancelled-badge">Cancelled</span>
      <span>{{ monthName }}</span>
    </header>
    <div class="notice">
      {{ cancelledNext.frontmatter.notice || 'This event has been cancelled.' }}
    </div>
    <div v-if="nextEvent">
      <p>
        Next meetup:
        <a :href="nextEvent.url">{{ nextEvent.frontmatter.title }}</a>
        <span> — {{ nextEvent.frontmatter.date.split('T')[0] }}</span>
      </p>
    </div>
  </div>

  <div class="next-event no-event" v-else-if="nextEvent">
    <header>
      <span>{{ monthName }}</span>
    </header>
    <p>
      No event scheduled for {{ monthName }}.
      Next meetup:
      <a :href="nextEvent.url">{{ nextEvent.frontmatter.title }}</a>
      <span> — {{ nextEvent.frontmatter.date.split('T')[0] }}</span>
    </p>
  </div>

  <p class="no-next-event" v-else>
    No upcoming event listed, yet.
    Please also check
    <a href="https://lu.ma/vuejs_berlin">our Luma event calendar</a>!
  </p>
</template>
