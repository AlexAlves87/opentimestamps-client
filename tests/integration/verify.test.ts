/**
 * Integration tests for verify() operation
 * Tests blockchain verification and proof validation
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { OpenTimestampsClient } from '../../src/client.js'
import { handlers, FAKE_COMPLETE_OTS, FAKE_INCOMPLETE_OTS } from '../mocks/handlers.js'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('verify() - Integration Tests', () => {
  it('should verify a complete proof successfully', async () => {
    const client = new OpenTimestampsClient()

    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))

    expect(result.valid).toBe(true)
    expect(result.blockHeight).toBe(123456)
    expect(result.blockHash).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('should verify with original file hash', async () => {
    const client = new OpenTimestampsClient()
    const originalHash = 'aa'.repeat(32) // Match fixture hash

    const result = await client.verify(
      Buffer.from(FAKE_COMPLETE_OTS),
      originalHash
    )

    expect(result.valid).toBe(true)
    expect(result.blockHeight).toBe(123456)
  })

  it('should fail verification with wrong file hash', async () => {
    const client = new OpenTimestampsClient()
    const wrongHash = 'bb'.repeat(32) // Different hash

    const result = await client.verify(
      Buffer.from(FAKE_COMPLETE_OTS),
      wrongHash
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('File hash does not match')
  })

  it('should fail verification for incomplete proof', async () => {
    const client = new OpenTimestampsClient()

    const result = await client.verify(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(result.valid).toBe(false)
    expect(result.error).toContain('No Bitcoin attestation found')
  })

  it('should handle invalid .ots format', async () => {
    const client = new OpenTimestampsClient()
    const invalidProof = Buffer.from([0xff, 0xff, 0xff])

    const result = await client.verify(invalidProof)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid .ots proof format')
  })

  it('should handle blockchain API failure gracefully', async () => {
    const client = new OpenTimestampsClient()

    // Mock Blockstream API to fail
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => {
        return HttpResponse.error()
      })
    )

    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))

    // Should still be valid but with warning about API
    expect(result.valid).toBe(true)
    expect(result.blockHeight).toBe(123456)
    if (result.error) {
      expect(result.error).toContain('Could not verify against blockchain API')
    }
  })

  it.skip('should handle non-existent block', async () => {
    const client = new OpenTimestampsClient()

    // Mock Blockstream API to return 404
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => {
        return new HttpResponse(null, { status: 404 })
      })
    )

    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Block 123456 not found')
  })

  it('should handle malformed blockchain API response', async () => {
    const client = new OpenTimestampsClient()

    // Mock Blockstream API with invalid response
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => {
        return HttpResponse.text('invalid hash format')
      }),
      http.get('https://blockstream.info/api/block/:hash', () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))

    // Should succeed with just block height
    expect(result.valid).toBe(true)
    expect(result.blockHeight).toBe(123456)
  })

  it('should accept Buffer as file hash', async () => {
    const client = new OpenTimestampsClient()
    const hashBuffer = Buffer.from('aa'.repeat(32), 'hex')

    const result = await client.verify(
      Buffer.from(FAKE_COMPLETE_OTS),
      hashBuffer
    )

    expect(result.valid).toBe(true)
  })

  it('should validate hex string hash format', async () => {
    const client = new OpenTimestampsClient()
    const invalidHash = 'not-a-hex-string'

    const result = await client.verify(
      Buffer.from(FAKE_COMPLETE_OTS),
      invalidHash
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Hash must be a 64-character hex string')
  })

  it('should validate hash length', async () => {
    const client = new OpenTimestampsClient()
    const shortHash = 'aa'.repeat(16) // Only 32 chars instead of 64

    const result = await client.verify(
      Buffer.from(FAKE_COMPLETE_OTS),
      shortHash
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Hash must be a 64-character hex string')
  })
})