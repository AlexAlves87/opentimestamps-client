import { writeFileSync } from 'fs'
import { OpenTimestampsClient } from '../../src/client.js'

const TEST_HASH = 'aaaa'.repeat(16) // 64 chars hex

async function generate() {
  const client = new OpenTimestampsClient({
    calendars: ['https://alice.btc.calendar.opentimestamps.org'],
  })
  
  try {
    const proof = await client.stamp(TEST_HASH)
    writeFileSync('tests/fixtures/incomplete.ots', proof)
    console.log('✅ Generated incomplete.ots')
  } catch (e) {
    console.error('❌ Failed:', e)
  }
}

generate()