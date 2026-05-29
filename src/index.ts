/**
 * @alexalves87/opentimestamps-client
 * 
 * Official OpenTimestamps client SDK with resilience patterns
 * 
 * @module
 */

// Main client
export { OpenTimestampsClient } from './client.js'

// Types
export type {
  ClientOptions,
  OperationOptions,
  ResilienceOptions,
  RetryOptions,
  CircuitBreakerOptions,
  Logger,
  VerificationResult,
  BackoffStrategy,
  JitterType,
} from './types.js'

export { DEFAULT_CALENDARS, DEFAULT_RESILIENCE } from './types.js'

// Errors
export {
  OpenTimestampsClientError,
  ValidationError,
  StampError,
  UpgradeError,
  NetworkError,
  CircuitBreakerError,
} from './errors.js'

// Internal types that might be useful for advanced users
export { CircuitState } from './network/circuit-breaker.js'

// Re-export commonly used types from base library for convenience
export type {
  OTSProof,
  Operation,
  Attestation,
  PendingAttestation,
  BitcoinAttestation,
} from '@alexalves87/opentimestamps'