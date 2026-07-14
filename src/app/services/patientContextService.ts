// src/app/services/patientContextService.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const SESSION_KEY = 'intellirx_ctx';
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredContext {
  patientId: string;
  ts: number;
}

/**
 * PatientContextService
 *
 * Securely bridges navigation state to routed components without
 * exposing internal database IDs in the browser URL.
 *
 * Strategy:
 *   1. Caller sets patientId via setPatient() before navigating.
 *   2. The routed component reads getPatientId() in ngOnInit.
 *   3. On browser refresh, getPatientId() falls back to sessionStorage
 *      (2-hour TTL) so the page still loads correctly.
 *   4. On clear() / tab close, sessionStorage is wiped.
 */
@Injectable({ providedIn: 'root' })
export class PatientContextService {
  private readonly patientId$ = new BehaviorSubject<string | null>(null);

  /** Observable patient ID — useful for reactive consumers. */
  readonly patientId = this.patientId$.asObservable();

  /**
   * Persist the patient ID in memory and in sessionStorage.
   * Call this immediately before navigating to /patient/view or /patient/add-visit.
   */
  setPatient(patientId: string): void {
    this.patientId$.next(patientId);
    try {
      const payload: StoredContext = { patientId, ts: Date.now() };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage unavailable (e.g. private browsing quota) — in-memory only
    }
  }

  /**
   * Return the current patient ID.
   * Checks in-memory first, then falls back to sessionStorage.
   * Returns null if there is no valid context (e.g. direct URL access in new tab).
   */
  getPatientId(): string | null {
    // Fast path: already in memory
    const inMemory = this.patientId$.value;
    if (inMemory) return inMemory;

    // Fallback: restore from sessionStorage (survives browser refresh)
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const stored: StoredContext = JSON.parse(raw);
      if (!stored?.patientId) return null;
      // Expire stale entries
      if (Date.now() - (stored.ts ?? 0) > TTL_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      // Re-hydrate in-memory state
      this.patientId$.next(stored.patientId);
      return stored.patientId;
    } catch {
      return null;
    }
  }

  /**
   * Clear the patient context (e.g. on logout or returning to /home).
   */
  clear(): void {
    this.patientId$.next(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch { /* silent */ }
  }
}
