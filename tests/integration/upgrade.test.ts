/**
 * Integration tests for upgrade() operation with MSW
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { UpgradeError, ValidationError } from '../../src/errors.js'
import { FAKE_INCOMPLETE_OTS, FAKE_COMPLETE_OTS } from '../mocks/handlers.js'

describe('upgrade() - Integration Tests', () => {
  it('should upgrade successfully from first calendar', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    // First calendar returns complete proof
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(FAKE_INCOMPLETE_OTS)

    expect(upgradedProof).toBeInstanceOf(Buffer)
    expect(upgradedProof.length).toBeGreaterThan(0)
  })

  it('should upgrade successfully from second calendar when first has no confirmation', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    let aliceCallCount = 0
    let bobCallCount = 0

    server.use(
      // Alice returns incomplete (no Bitcoin attestation yet)
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        aliceCallCount++
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Bob returns complete
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        bobCallCount++
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(upgradedProof).toBeInstanceOf(Buffer)
    expect(aliceCallCount).toBe(1) // Alice was queried
    expect(bobCallCount).toBe(1)   // Bob was queried too
  })

  it('should throw UpgradeError when no calendar has confirmed yet', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    // Both return incomplete (no Bitcoin confirmation)
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    await expect(
      client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    ).rejects.toThrow(UpgradeError)
  })

  it('should skip upgrade if proof is already confirmed', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    // Pass already complete proof
    const result = await client.upgrade(Buffer.from(FAKE_COMPLETE_OTS))

    // Should return the same proof without querying calendars
    expect(result).toBeInstanceOf(Buffer)
    expect(result.equals(Buffer.from(FAKE_COMPLETE_OTS))).toBe(true)
  })

  it.skip('should continue to next calendar when one fails with network error', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
      ],
      resilience: {
        retries: {
          maxAttempts: 1, // No retries for faster test
        },
      },
    })

    server.use(
      // Alice fails with network error
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.error()
      }),
      // Bob returns incomplete
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Finney returns complete
      http.get('https://finney.calendar.eternitywall.com/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(upgradedProof).toBeInstanceOf(Buffer)
    // Should succeed with Finney's response
  })

  it('should throw UpgradeError when all calendars fail', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
      resilience: {
        retries: {
          maxAttempts: 1,
        },
      },
    })

    // All fail with 503
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    await expect(
      client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    ).rejects.toThrow(UpgradeError)
  })

  it('should throw ValidationError for invalid proof format', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    const invalidProof = Buffer.from('invalid binary data')

    await expect(client.upgrade(invalidProof)).rejects.toThrow(ValidationError)
  })

  it('should handle calendar returning invalid OTS data', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    server.use(
      // Alice returns garbage
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xff, 0xff]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Bob returns valid complete proof
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    // Should skip Alice's garbage and use Bob's valid response
    expect(upgradedProof).toBeInstanceOf(Buffer)
  })

  it('should query calendars sequentially, not in parallel', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    const callOrder: string[] = []

    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', async () => {
        callOrder.push('alice-start')
        await new Promise(resolve => setTimeout(resolve, 100))
        callOrder.push('alice-end')
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', async () => {
        callOrder.push('bob-start')
        await new Promise(resolve => setTimeout(resolve, 100))
        callOrder.push('bob-end')
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    // Alice should complete before Bob starts (sequential)
    expect(callOrder).toEqual(['alice-start', 'alice-end'])
    // Bob should NOT be called since Alice succeeded
  })
})/**
 * Integration tests for upgrade() operation with MSW
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { UpgradeError, ValidationError } from '../../src/errors.js'
import { FAKE_INCOMPLETE_OTS, FAKE_COMPLETE_OTS } from '../mocks/handlers.js'

describe('upgrade() - Integration Tests', () => {
  it('should upgrade successfully from first calendar', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    // First calendar returns complete proof
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(upgradedProof).toBeInstanceOf(Buffer)
    expect(upgradedProof.length).toBeGreaterThan(0)
  })

  it('should upgrade successfully from second calendar when first has no confirmation', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    let aliceCallCount = 0
    let bobCallCount = 0

    server.use(
      // Alice returns incomplete (no Bitcoin attestation yet)
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        aliceCallCount++
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Bob returns complete
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        bobCallCount++
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(upgradedProof).toBeInstanceOf(Buffer)
    expect(aliceCallCount).toBe(1) // Alice was queried
    expect(bobCallCount).toBe(1)   // Bob was queried too
  })

  it('should throw UpgradeError when no calendar has confirmed yet', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    // Both return incomplete (no Bitcoin confirmation)
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    await expect(
      client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    ).rejects.toThrow(UpgradeError)
  })

  it('should skip upgrade if proof is already confirmed', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    // Pass already complete proof
    const result = await client.upgrade(Buffer.from(FAKE_COMPLETE_OTS))

    // Should return the same proof without querying calendars
    expect(result).toBeInstanceOf(Buffer)
    expect(result.equals(Buffer.from(FAKE_COMPLETE_OTS))).toBe(true)
  })

  it.skip('should continue to next calendar when one fails with network error', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
      ],
      resilience: {
        retries: {
          maxAttempts: 1, // No retries for faster test
        },
      },
    })

    server.use(
      // Alice fails with network error
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.error()
      }),
      // Bob returns incomplete
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_INCOMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Finney returns complete
      http.get('https://finney.calendar.eternitywall.com/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    expect(upgradedProof).toBeInstanceOf(Buffer)
    // Should succeed with Finney's response
  })

  it('should throw UpgradeError when all calendars fail', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
      resilience: {
        retries: {
          maxAttempts: 1,
        },
      },
    })

    // All fail with 503
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    await expect(
      client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    ).rejects.toThrow(UpgradeError)
  })

  it('should throw ValidationError for invalid proof format', async () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    })

    const invalidProof = Buffer.from('invalid binary data')

    await expect(client.upgrade(invalidProof)).rejects.toThrow(ValidationError)
  })

  it('should handle calendar returning invalid OTS data', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    server.use(
      // Alice returns garbage
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xff, 0xff]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      // Bob returns valid complete proof
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', () => {
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    const upgradedProof = await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    // Should skip Alice's garbage and use Bob's valid response
    expect(upgradedProof).toBeInstanceOf(Buffer)
  })

  it('should query calendars sequentially, not in parallel', async () => {
    const client = new OpenTimestampsClient({
      calendars: [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
      ],
    })

    const callOrder: string[] = []

    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/*', async () => {
        callOrder.push('alice-start')
        await new Promise(resolve => setTimeout(resolve, 100))
        callOrder.push('alice-end')
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/*', async () => {
        callOrder.push('bob-start')
        await new Promise(resolve => setTimeout(resolve, 100))
        callOrder.push('bob-end')
        return HttpResponse.arrayBuffer(FAKE_COMPLETE_OTS.buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )

    await client.upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))

    // Alice should complete before Bob starts (sequential)
    expect(callOrder).toEqual(['alice-start', 'alice-end'])
    // Bob should NOT be called since Alice succeeded
  })
})