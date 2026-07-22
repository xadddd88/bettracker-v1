'use strict'

const css = "@font-face { font-family: 'Acceptance'; font-style: normal; font-weight: 100 900; src: url(mock-font.woff2) format('woff2'); }"

module.exports = new Proxy({}, {
  get() { return css },
})
