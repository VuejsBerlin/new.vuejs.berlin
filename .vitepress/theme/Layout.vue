<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'
import { useImage } from '@vueuse/core'

import Logo from './components/Logo.vue'
import SiteFooter from './components/SiteFooter.vue'
import PageHeader from './components/Header.vue'
import SideBar from './components/SideBar.vue'

import wallpaperPath from './assets/wallpaper.jpg'
import useImageLoader from './useImageLoader'

// https://vitepress.dev/reference/runtime-api#usedata
const { site, page, frontmatter } = useData()
const wallpaper = useImage({ src: wallpaperPath })
const wallpaperStyle = computed(() => {
  return wallpaper.isReady.value ? `background-image: url(${wallpaperPath})` : ''
})
const wallpaperCSSClass = computed(() => {
  return wallpaper.isReady.value ? 'lazy-load-success' : 'lazy-load-progress'
})

const withMenu = ref(false)

const isCancelledPage = computed(() =>
  page.value.relativePath.includes('.cancelled.')
)
</script>

<template>
  <div class="greeting" v-if="frontmatter.home">
    <div id="wallpaper" :style="wallpaperStyle" :class="wallpaperCSSClass">
      <Logo />
      <div class="hint animated twice tada">scroll down</div>
      <SiteFooter />
    </div>

    <article class="content-container">
      <h1>{{ site.title }}</h1>
      <p>{{ site.description }}</p>
      <hr/>
      <Content />
    </article>
  </div>
  <div v-else class="layout" :class="{'with-menu': withMenu}">
    <PageHeader :title="page.title" @logo-click="withMenu = false" :withMenu="false" />
    <SideBar @click="withMenu = false" menu-hint />

    <article class="content-container">
      <div class="hero" v-if="frontmatter.hero">
        <img :src="frontmatter.hero" :alt="frontmatter.hero_alt || `${frontmatter.title} hero image`" />
      </div>
      <div class="cancelled-banner" v-if="isCancelledPage">
        ⚠️ {{ frontmatter.notice || 'This event has been cancelled.' }}
      </div>
      <Content />
    </article>
  </div>
</template>

<style>
.greeting #logo {
  position: absolute;
  top: 0;
  z-index: 1;
  display: block;
  width: 100vw;
  height: 40vh;
  margin-top: 30vh;
  transform: scale(1.0) translate(0, 0);
}
#wallpaper {
  z-index: -1;
  display: block;
  width: 100vw;
  height: 100vh;
  transition: opacity .5s ease-in;
  opacity: .5;
  background-color: grey;
  background-image: url('./assets/wallpaper-preview.jpg');
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
.index-wrapper {
  height: calc(100vh - 5rem);
}
.hint {
  position: absolute;
  width: 100vw;
  top: 75vh;
  text-align: center;
  color: rgba(255, 255, 255, .65);
  font-weight: bold;
}
#wallpaper.lazy-load-progress { filter: blur(5px) saturate(25%); }
#wallpaper.lazy-load-success { opacity: 1; }

.fade-enter-active, .fade-leave-active {
  transition: opacity .5s ease;
}
.fade-enter, .fade-leave-active {
  opacity: 0
}

#wallpaper > footer {
  position: absolute;
  bottom: 1em;
  width: 97%;
  font-size: 1rem;
  text-align: right;
  color: rgba(255, 255, 255, .6);
}
#wallpaper > footer a {
  color: #41b883;
}

.layout {
  transition: transform .2s ease;
  transform: translate(0, 0);
}
.layout.with-menu {
  transform: translate(260px, 0);
}
</style>
