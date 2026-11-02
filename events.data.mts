import { createContentLoader } from 'vitepress'

// The excerpt of an event is everything before its `<!-- more -->` marker.
// VitePress's default (`excerpt: true`) makes gray-matter look for a `---`
// separator in the body instead, which our event files don't have — so the
// excerpt would always come out empty.
export default createContentLoader('events/*.md', {
  excerpt: '<!-- more -->'
})
