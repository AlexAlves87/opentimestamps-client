/**
 * Core orchestration layer for OpenTimestamps operations
 * Handles validation, request mapping, and response processing
 */

import {
  deserializeOTS,
  serializeOTS,
  hasConfirmedAttestation,
  getPendingAttestations,
  parseBitcoinBlockHeight,
  getBitcoinAttestation,
  bytesToHex,
} from '@alexalves87/opentimestamps'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { ValidationError, StampError, UpgradeError, NetworkError } from '../errors.js'
import { Logger, VerificationResult } from '../types.js'

/**
 * Validate that a hash is a valid SHA-256 hash
 */
function validateHash(hash: Buffer | string): Buffer {
  let hashBuffer: Buffer

  if (typeof hash === 'string') {
    // Remove any whitespace and convert to lowercase
    hash = hash.trim().toLowerCase()

    // Check if valid hex
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new ValidationError('Hash must be a 64-character hex string (SHA-256)')
    }

    hashBuffer = Buffer.from(hash, 'hex')
  } else {
    hashBuffer = hash
  }

  if (hashBuffer.length !== 32) {
    throw new ValidationError('Hash must be exactly 32 bytes (SHA-256)')
  }

  return hashBuffer
}

/**
 * Orchestrate the stamp operation
 */
export async function orchestrateStamp(
  hash: Buffer | string,
  calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal,
  minimumSuccessfulSubmissions: number = 2
): Promise<Buffer> {
  // Validate hash
  const hashBuffer = validateHash(hash)
  const hexHash = hashBuffer.toString('hex')

  logger?.info(`Starting stamp operation for hash ${hexHash}`)

  // Submit to all calendars in parallel
  const submissions = calendars.map(async (calendarUrl) => {
    try {
      const url = `${calendarUrl}/timestamp/${hexHash}`
      
      await networkLayer.request(
        calendarUrl,
        {
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        },
        signal
      )

      logger?.info(`Successfully submitted to ${calendarUrl}`)
      
      return {
        calendar: calendarUrl,
        success: true as const,
      }
    } catch (error) {
      logger?.warn(`Failed to submit to ${calendarUrl}: ${error}`)
      
      return {
        calendar: calendarUrl,
        success: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  })

  const results = await Promise.allSettled(submissions)

  // Separate successful and failed submissions
  const successful: Array<{ calendar: string }> = []
  const failed: Array<{ calendar: string; error: Error }> = []

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successful.push({ calendar: result.value.calendar })
      } else {
        failed.push({ calendar: result.value.calendar, error: result.value.error })
      }
    } else {
      // This shouldn't happen since we catch errors above, but handle it anyway
      failed.push({
        calendar: 'unknown',
        error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
      })
    }
  }

  // Check if we meet the minimum threshold
  if (successful.length < minimumSuccessfulSubmissions) {
    throw new StampError(
      `Insufficient successful submissions (${successful.length}/${minimumSuccessfulSubmissions} required)`,
      successful,
      failed
    )
  }

  logger?.info(`Stamp operation completed: ${successful.length} successful, ${failed.length} failed`)

  // Create initial .ots proof with pending attestations
  // CRITICAL: Only include calendars that successfully accepted the hash
  const proof = {
    version: 1,
    fileHash: new Uint8Array(hashBuffer),
    operations: [],
    attestations: successful.map(({ calendar }) => ({
      type: 0x00 as const, // PENDING
      payload: new TextEncoder().encode(calendar),
      uri: calendar,
    })),
  }

  // Serialize and return
  const otsBytes = serializeOTS(proof)
  return Buffer.from(otsBytes)
}

/**
 * Orchestrate the upgrade operation
 */
export async function orchestrateUpgrade(
  incompleteProof: Buffer,
  calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal
): Promise<Buffer> {
  logger?.info('Starting upgrade operation')

  // Deserialize proof
  let proof
  try {
    proof = deserializeOTS(new Uint8Array(incompleteProof))
  } catch (error) {
    throw new ValidationError('Invalid .ots proof format', {
      cause: error instanceof Error ? error : undefined,
    })
  }

  // Check if already confirmed
  if (hasConfirmedAttestation(proof.attestations)) {
    logger?.info('Proof already has Bitcoin attestation, no upgrade needed')
    return incompleteProof
  }

  // Get pending attestations
  const pendings = getPendingAttestations(proof.attestations)
  if (pendings.length === 0) {
    logger?.warn('Proof has no pending attestations to upgrade')
    throw new UpgradeError('Proof has no pending attestations')
  }

  const hexHash = bytesToHex(proof.fileHash)
  logger?.info(`Querying ${pendings.length} calendars for hash ${hexHash}`)

  // Try each calendar sequentially (first success wins)
  for (const pending of pendings) {
    const calendarUrl = pending.uri

    try {
      logger?.debug(`Checking calendar ${calendarUrl}`)

      const url = `${calendarUrl}/timestamp/${hexHash}`
      const response = await networkLayer.request(
        calendarUrl,
        { url, method: 'GET' },
        signal
      )

      // Try to deserialize response
      let upgradedProof
      try {
        upgradedProof = deserializeOTS(response.data)
      } catch {
        logger?.debug(`Calendar ${calendarUrl} returned invalid .ots data`)
        continue
      }

      // Check if it has Bitcoin attestation
      if (hasConfirmedAttestation(upgradedProof.attestations)) {
        const bitcoinAtt = getBitcoinAttestation(upgradedProof.attestations)
        const blockHeight = bitcoinAtt ? parseBitcoinBlockHeight(bitcoinAtt.payload) : undefined

        logger?.info(
          `Upgrade successful from ${calendarUrl}${blockHeight ? ` (block ${blockHeight})` : ''}`
        )

        return Buffer.from(response.data)
      } else {
        logger?.debug(`Calendar ${calendarUrl} has not confirmed yet`)
      }
    } catch (error) {
      logger?.warn(`Failed to query ${calendarUrl}: ${error}`)
      // Continue to next calendar
    }
  }

  // No calendar had a confirmed attestation yet
  throw new UpgradeError('No calendar has confirmed the timestamp yet (Bitcoin not yet mined)')
}

/**
 * Orchestrate the verify operation
 * This is mostly a pass-through to the base library with blockchain verification
 */
export async function orchestrateVerify(
  proof: Buffer,
  originalDataHash?: Buffer | string,
  logger?: Logger
): Promise<VerificationResult> {
  logger?.info('Starting verify operation')

  // Deserialize proof
  let otsProof
  try {
    otsProof = deserializeOTS(new Uint8Array(proof))
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid .ots proof format',
    }
  }

  // Verify file hash matches if provided
  if (originalDataHash) {
    try {
      const expectedHash = validateHash(originalDataHash)
      const proofHash = Buffer.from(otsProof.fileHash)

      if (!expectedHash.equals(proofHash)) {
        return {
          valid: false,
          error: 'File hash does not match proof',
        }
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid hash format',
      }
    }
  }

  // Check if has Bitcoin attestation
  if (!hasConfirmedAttestation(otsProof.attestations)) {
    return {
      valid: false,
      error: 'No Bitcoin attestation found (timestamp not yet confirmed)',
    }
  }

  // Extract Bitcoin attestation details
  const bitcoinAtt = getBitcoinAttestation(otsProof.attestations)
  if (!bitcoinAtt) {
    return {
      valid: false,
      error: 'Invalid Bitcoin attestation',
    }
  }

  const blockHeight = parseBitcoinBlockHeight(bitcoinAtt.payload)

  // Verify against blockchain (optional, requires network call)
  try {
    const blockstreamUrl = `https://blockstream.info/api/block-height/${blockHeight}`
    const response = await fetch(blockstreamUrl)

    if (!response.ok) {
      return {
        valid: false,
        error: `Block ${blockHeight} not found in blockchain`,
      }
    }

    const blockHash = await response.text()

    // Get block details
    const blockResponse = await fetch(`https://blockstream.info/api/block/${blockHash.trim()}`)
    if (!blockResponse.ok) {
      return {
        valid: true,
        blockHeight,
      }
    }

    const blockData = await blockResponse.json()

    logger?.info(`Verification successful: block ${blockHeight} at ${new Date(blockData.timestamp * 1000)}`)

    return {
      valid: true,
      blockHeight,
      blockHash: blockHash.trim(),
      timestamp: blockData.timestamp,
    }
  } catch (error) {
    logger?.warn(`Could not verify against blockchain API: ${error}`)
    
    // Attestation exists but couldn't double-check
    return {
      valid: true,
      blockHeight,
      error: 'Could not verify against blockchain API (proof is valid but not double-checked)',
    }
  }
}