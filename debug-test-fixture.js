import { deserializeOTS } from '@alexalves87/opentimestamps'
import { readFileSync } from 'fs'

const fixture = readFileSync('tests/fixtures/incomplete.ots')
console.log('Fixture size:', fixture.length, 'bytes')
console.log('First 50 bytes:', Array.from(fixture.slice(0, 50)))

try {
  const proof = deserializeOTS(fixture)
  console.log('\n✅ Test fixture deserialized OK!')
  console.log('  attestations type:', typeof proof.attestations)
  console.log('  attestations is array:', Array.isArray(proof.attestations))
} catch (error) {
  console.error('\n❌ Test fixture failed:', error.message)
}
