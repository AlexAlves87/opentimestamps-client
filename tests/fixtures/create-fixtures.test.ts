/**
 * Helper test to generate real .ots fixtures
 * Run once to create incomplete.ots and complete.ots
 */
import { describe, it } from 'vitest'
import { writeFileSync } from 'fs'
import { OpenTimestampsClient } from '../../src/client.js'

describe('Generate fixtures (run manually)', () => {
  it('should generate incomplete.ots from stamp()', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    const TEST_HASH = 'a'.repeat(64) // Valid SHA256 hex

    const proof = await client.stamp(TEST_HASH)
    
    writeFileSync('tests/fixtures/incomplete.ots', proof)
    console.log('✅ Created tests/fixtures/incomplete.ots')
    console.log(`   Size: ${proof.length} bytes`)
  })
})