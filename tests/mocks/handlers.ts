/**
 * MSW handlers for OpenTimestamps calendars and Blockstream API
 */
import { http, HttpResponse } from 'msw'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load REAL .ots fixtures as Uint8Array
const FAKE_INCOMPLETE_OTS = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/incomplete.ots'))
)

const FAKE_COMPLETE_OTS = new Uint8Array(
  readFileSync(join(__dirname, '../fixtures/complete.ots'))
)

// Calendar URL patterns
const CALENDAR_URLS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
]

export const handlers = [
  // POST /timestamp/:hash - stamp operation (all calendars respond 200 by default)
  ...CALENDAR_URLS.map((calendarUrl) =>
    http.post(`${calendarUrl}/timestamp/:hexHash`, () => {
      return new HttpResponse(null, { status: 200 })
    })
  ),

  // GET /timestamp/:hash - upgrade operation
  // By default, return INCOMPLETE proof (not yet confirmed)
  ...CALENDAR_URLS.map((calendarUrl) =>
    http.get(`${calendarUrl}/timestamp/:hexHash`, () => {
      return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    })
  ),

  // Blockstream API - block by height
  http.get('https://blockstream.info/api/block-height/:height', () => {
    return HttpResponse.text(`000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f`)
  }),

  // Blockstream API - block by hash
  http.get('https://blockstream.info/api/block/:hash', () => {
    return HttpResponse.json({
      id: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      height: 123456,
      timestamp: 1609459200,
      tx_count: 2500,
    })
  }),
]

// Export fixtures for use in tests (as Buffer for backwards compat)
export const FAKE_INCOMPLETE_OTS_BUFFER = Buffer.from(FAKE_INCOMPLETE_OTS)
export const FAKE_COMPLETE_OTS_BUFFER = Buffer.from(FAKE_COMPLETE_OTS)
export { FAKE_INCOMPLETE_OTS, FAKE_COMPLETE_OTS }