// ─────────────────────────────────────────────────────────────────────────────
//  Site configuration — edit freely. (Plain JS so you can compute things if you need to.)
// ─────────────────────────────────────────────────────────────────────────────

export default {
  title: 'Ryou',
  description: 'Reverse engineering, CTF write-ups and weird things.',
  lang: 'en',
  author: 'Trần Anh Thi',

  // Public URL of the site (no trailing slash). For a project page (user.github.io/repo) also set `base: '/repo'`.
  url: 'https://ryouthecat.github.io',
  base: '',

  profile: {
    name: 'Ryou',
    tagline: 'A Rookie Reverse Engineer',
    headline: 'Reverse engineering, CTFs, and weird things.',
    avatar: '/img/avatar.jpg',
  },

  nav: [
    { label: 'Posts', href: '/posts/' },
    { label: 'Tags', href: '/tags/' },
    { label: 'About', href: '/about/' },
  ],

  social: [
    { name: 'GitHub', href: 'https://github.com/ryouthecat' },
    { name: 'Email', href: 'mailto:trananhthi072007@gmail.com' },
  ],

  // Post categories = sub-folders of content/posts/ (folder name must equal the key below).
  // Order here = display order. A category only shows up on the site once it has at least one post.
  // icon: flag | sword | tnt | potion | creeper | anvil | table | book | apple | heart | grass   (see engine/pixel.js)
  sections: {
    ctf: { title: 'CTF', icon: 'flag', description: 'Write-ups from competitions.' },
    wargames: { title: 'Wargames', icon: 'sword', description: 'Notes on practice challenges.' },
    cve: { title: 'CVE', icon: 'tnt', description: 'Vulnerability analysis and exploits.' },
    research: { title: 'Research', icon: 'potion', description: 'Deeper dives and experiments.' },
    malware: { title: 'Malware', icon: 'creeper', description: 'Samples taken apart.' },
    tools: { title: 'Tools', icon: 'anvil', description: 'Scripts, plugins and utilities.' },
    projects: { title: 'Projects', icon: 'table', description: 'Things I built.' },
    notes: { title: 'Notes', icon: 'book', description: 'Things I learned, explained.' },
    selfhelp: { title: 'Self-help', icon: 'apple', description: 'Habits, mindset and growing up.' },
  },

  // Old URLs that should keep working (HTML redirect stubs). Post-level redirects live in front matter `aliases`.
  redirects: {
    '/posts/misc/': '/posts/notes/',
    '/posts/note/': '/posts/wargames/',
  },

  defaultTheme: 'dark', // 'dark' = night, 'light' = day
  homeLatest: 5, // posts on the home page
  wordsPerMinute: 200,
  codeCollapseLines: 36, // code blocks longer than this get a scroll box + expand button

  // Accent colours ("dyes") offered by the palette button.
  dyes: [
    { id: 'grass', name: 'Grass', color: '#6cc24a' },
    { id: 'diamond', name: 'Diamond', color: '#4fd6d0' },
    { id: 'lapis', name: 'Lapis', color: '#6f8cff' },
    { id: 'amethyst', name: 'Amethyst', color: '#b58cff' },
    { id: 'redstone', name: 'Redstone', color: '#ff6b5e' },
    { id: 'gold', name: 'Gold', color: '#f2b84b' },
    { id: 'copper', name: 'Copper', color: '#e8875a' },
  ],
};
