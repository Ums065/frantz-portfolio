import assert from 'node:assert/strict'
import { buildLocalQrDataUri, buildLocalQrSvg } from '../frontend/src/lib/localQr.js'

const sample =
  'https://frantzcoutard.com/new-school/parent/0123456789abcdef0123456789abcdef'

const svg = buildLocalQrSvg(sample)
assert.ok(svg.startsWith('<?xml'), 'SVG should start with an XML declaration.')
assert.ok(svg.includes('<svg'), 'SVG markup is missing.')
assert.ok(svg.includes('<rect'), 'SVG should contain QR modules.')

const dataUri = buildLocalQrDataUri(sample)
assert.ok(dataUri.startsWith('data:image/svg+xml'), 'QR data URI should be SVG.')
assert.ok(!dataUri.includes('qrserver'), 'External QR service should not be referenced.')

const repeat = buildLocalQrDataUri(sample)
assert.equal(repeat, dataUri, 'QR generation should be deterministic.')

console.log('new_school QR smoke test passed')
