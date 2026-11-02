<script setup lang="ts">
import { computed } from 'vue'

// Injected by Vite at build time — see `.vitepress/config.mts`.
declare const __BUILD_TIME__: string

// The RSVP links of an event, one button per provider. Events may have an
// OpenMeet link, a Luma link, both, or — for the older ones — neither.
const props = defineProps<{
  openmeetUrl?: string
  lumaUrl?: string
  date?: string
  cancelled?: boolean
}>()

// An event that has already happened can't be RSVP'd for anymore, and a
// cancelled one can't either. The link still leads to the provider's event
// page, so it stays clickable — it just isn't an RSVP call to action.
const past = computed(() => {
  if (!props.date) return false
  const start = new Date(props.date).getTime()
  return Number.isFinite(start) && start < new Date(__BUILD_TIME__).getTime()
})

const rsvpable = computed(() => !past.value && !props.cancelled)

const links = computed(() => {
  const result: { label: string; href: string }[] = []
  if (props.openmeetUrl) {
    result.push({
      label: rsvpable.value ? 'RSVP on OpenMeet' : 'OpenMeet Event Page',
      href: props.openmeetUrl
    })
  }
  if (props.lumaUrl) {
    result.push({
      label: rsvpable.value ? 'RSVP on Luma' : 'Luma Event Page',
      href: props.lumaUrl
    })
  }
  return result
})
</script>

<template>
  <div class="rsvp" :class="{ cancelled }" v-if="links.length">
    <a v-for="link in links" :key="link.href" class="rsvp-link"
      :href="link.href" target="_blank" rel="noopener">{{ link.label }}</a>
  </div>
</template>
