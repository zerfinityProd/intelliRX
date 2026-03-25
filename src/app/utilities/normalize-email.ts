/**
 * Single canonical form for emails used as Firestore document IDs and doctorId.
 * Matches Firebase Auth normalization and avoids whitespace mismatches.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
