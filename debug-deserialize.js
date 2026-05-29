import { deserializeOTS } from '@alexalves87/opentimestamps'
import { readFileSync } from 'fs'

const serialized = readFileSync('debug.ots')
console.log('Reading', serialized.length, 'bytes')

try {
  const proof = deserializeOTS(serialized)
  console.log('\n✅ Deserialized successfully!')
  console.log('Proof structure:')
  console.log('  version:', proof.version)
  console.log('  fileHash length:', proof.fileHash?.length)
  console.log('  operations:', proof.operations?.length)
  console.log('  attestations type:', typeof proof.attestations)
  console.log('  attestations:', Array.isArray(proof.attestations) ? 'is array' : 'NOT array')
  
  if (proof.attestations) {
    console.log('  attestations content:', JSON.stringify(proof.attestations, null, 2))
  }
} catch (error) {
  console.error('\n❌ Deserialization failed:', error.message)
  console.error('Stack:', error.stack)
}
