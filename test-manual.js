import { OpenTimestampsClient } from './dist/index.js'
import { readFileSync, writeFileSync } from 'fs'

const client = new OpenTimestampsClient()

console.log('🧪 Testing OpenTimestamps SDK manually...\n')

// Test 1: Stamp a hash
console.log('1️⃣  Testing stamp()...')
const testHash = 'a'.repeat(64)
console.log(`   Hash: ${testHash}`)

try {
  const proof = await client.stamp(testHash)
  console.log(`   ✅ Stamp successful! Proof size: ${proof.length} bytes`)
  writeFileSync('test-proof.ots', proof)
  console.log(`   💾 Saved to test-proof.ots\n`)
} catch (error) {
  console.error(`   ❌ Stamp failed: ${error.message}\n`)
}

// Test 2: Verify an incomplete proof
console.log('2️⃣  Testing verify() with incomplete proof...')
try {
  const incompleteProof = readFileSync('test-proof.ots')
  const result = await client.verify(incompleteProof)
  console.log(`   Result: ${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  console.error(`   ❌ Verify failed: ${error.message}\n`)
}

console.log('✅ Manual tests complete!')
