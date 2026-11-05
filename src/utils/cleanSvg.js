// Clean an SVG before it is put on the page with v-html.
//
// WHY: an SVG file is code, not just a picture. It can hold <script> tags and event handlers
// (e.g. <svg onload="...">) that run when it is put on the page as HTML. In the template editor,
// people upload their own SVGs, and a public template can be opened by anyone, so an SVG from
// one person could run code on someone else's computer as them.
//
// DOMPurify (a well-known library for exactly this) keeps the drawing (shapes, colours, gradients,
// filters) and removes everything that can run code or load other pages.

import DOMPurify from 'dompurify'

export function cleanSvg(svgText) {
  if (typeof svgText !== 'string' || svgText === '') return ''
  return DOMPurify.sanitize(svgText, {
    USE_PROFILES: { svg: true, svgFilters: true }, // only SVG drawing tags and attributes
  })
}
