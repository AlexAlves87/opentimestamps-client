import { serializeOTS } from '@alexalves87/opentimestamps'
import { writeFileSync } from 'fs'

const proof = {
  version: 1,
  fileHash: new Uint8Array(32).fill(0xaa),
  operations: [],
  attestations: [
    {
      type: 0x00,
      payload: new TextEncoder().encode('https://alice.btc.calendar.opentimestamps.org'),
      uri: 'https://alice.btc.calendar.opentimestamps.org',
    },
  ],
}

console.log('Input proof:', JSON.stringify(proof, null, 2))

const serialized = serializeOTS(proof)
console.log('Serialized length:', serialized.length)
console.log('First 50 bytes:', Array.from(serialized.slice(0, 50)))

writeFileSync('debug.ots', serialized)
console.log('Written to debug.ots')
