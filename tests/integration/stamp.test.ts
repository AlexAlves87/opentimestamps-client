/**
 * Integration tests for stamp() operation with MSW
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { StampError, ValidationError } from '../../src/errors.js'

const TEST_HASH = '1f02d20a78657fab24c5028383f23a45e11a8a25c102a86c6e768855b5059e3a'

describe('stamp() - Integration Tests', () => {
  it('should successfully stamp when all calendars respond 200', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    const proof = await client.stamp(TEST_HASH)

    // Validate response
    expect(proof).toBeInstanceOf(Buffer)
    expect(proof.length).toBeGreaterThan(30) // OTS magic + some data
  })

  it('should accept hash as Buffer', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    const hashBuffer = Buffer.from(TEST_HASH, 'hex')
    const proof = await client.stamp(hashBuffer)

    expect(proof).toBeInstanceOf(Buffer)
    expect(proof.length).toBeGreaterThan(0)
  })

  it('should succeed with partial success (2/4 calendars OK)', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
    })

    // Make 2 calendars fail
    server.use(
      http.post('https://finney.calendar.eternitywall.com/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      }),
      http.post('https://btc.calendar.catallaxy.com/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    // Should still succeed (2/4 is enough)
    const proof = await client.stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('should fail when 3/4 calendars fail', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
    })

    // Make 3 calendars fail
    server.use(
      http.post('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () =>
        new HttpResponse(null, { status: 503 })
      ),
      http.post('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () =>
        new HttpResponse(null, { status: 503 })
      ),
      http.post('https://finney.calendar.eternitywall.com/timestamp/*', () =>
        new HttpResponse(null, { status: 503 })
      )
    )

    await expect(client.stamp(TEST_HASH)).rejects.toThrow(StampError)
  })

  it('should throw ValidationError for invalid hash length', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    const invalidHash = 'abcd1234' // Too short

    await expect(client.stamp(invalidHash)).rejects.toThrow(ValidationError)
  })

  it('should throw ValidationError for non-hex characters', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    const invalidHash = 'z'.repeat(64) // Not hex

    await expect(client.stamp(invalidHash)).rejects.toThrow(ValidationError)
  })

  it('should retry on network errors and eventually fail', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
      resilience: {
        retries: {
          maxAttempts: 2,
        },
      },
    })

    server.use(
      http.post('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.error()
      }),
      http.post('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.error()
      })
    )

    await expect(client.stamp(TEST_HASH)).rejects.toThrow(StampError)
  })

  it('should NOT retry on 4xx client errors', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
      resilience: {
        retries: {
          maxAttempts: 3,
        },
      },
    })

    let aliceCallCount = 0
    let bobCallCount = 0

    server.use(
      http.post('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        aliceCallCount++
        return new HttpResponse(null, { status: 400 })
      }),
      http.post('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        bobCallCount++
        return new HttpResponse(null, { status: 404 })
      })
    )

    await expect(client.stamp(TEST_HASH)).rejects.toThrow(StampError)

    expect(aliceCallCount).toBe(1)
    expect(bobCallCount).toBe(1)
  })

  it('should work with custom minimumSuccessfulSubmissions', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
      minimumSuccessfulSubmissions: 3, // Require 3/4
    })

    server.use(
      http.post('https://btc.calendar.catallaxy.com/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    // 3/4 succeed, should pass
    const proof = await client.stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('should fail with custom threshold not met', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
      minimumSuccessfulSubmissions: 3, // Require 3/4
    })

    server.use(
      http.post('https://finney.calendar.eternitywall.com/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      }),
      http.post('https://btc.calendar.catallaxy.com/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    // Only 2/4 succeed, should fail (requires 3)
    await expect(client.stamp(TEST_HASH)).rejects.toThrow(StampError)
  })

  it('should handle mixed errors (network + 5xx)', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
    })

    server.use(
      http.post('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.error() // Network error
      }),
      http.post('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 }) // Server error
      })
    )

    // 2/4 succeed, should pass
    const proof = await client.stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
  })
})