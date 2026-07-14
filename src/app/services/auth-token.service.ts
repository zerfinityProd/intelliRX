// src/app/services/auth-token.service.ts
//
// ─── BACKWARD-COMPATIBILITY SHIM ─────────────────────────────────────────────
//
// Re-exports AuthTokenProvider under the legacy name so that any code written
// against the old AuthTokenService token continues to compile without changes.
//
export { AuthTokenProvider as AuthTokenService } from './auth/auth-token.provider';
