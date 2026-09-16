import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

type ClinicContext = {
  clinicId: string | null;
  subscriptionId: string | null;
};

// Session-scoped keys — survive page refresh within the same tab,
// cleared automatically when the tab/browser is closed.
// Nothing is written to localStorage.
const SS_CLINIC_ID = 'irx.c';
const SS_SUB_ID = 'irx.s';

@Injectable({ providedIn: 'root' })
export class ClinicContextService {
  private readonly contextSubject: BehaviorSubject<ClinicContext>;
  public readonly context$: Observable<ClinicContext>;

  /** Emits the new clinicId whenever the user explicitly switches clinic */
  public readonly clinicSwitch$ = new Subject<string>();

  constructor() {
    // Clean up any legacy localStorage keys from previous versions
    try {
      localStorage.removeItem('intellirx.selectedClinicId');
      localStorage.removeItem('intellirx.subscriptionId');
    } catch { /* ignore */ }

    // Restore from sessionStorage so the clinic selector is not re-shown
    // on a simple page refresh, while still prompting on fresh login.
    const restoredClinicId = this.readSession(SS_CLINIC_ID);
    const restoredSubId    = this.readSession(SS_SUB_ID);

    this.contextSubject = new BehaviorSubject<ClinicContext>({
      clinicId:       restoredClinicId,
      subscriptionId: restoredSubId
    });
    this.context$ = this.contextSubject.asObservable();
  }

  getSelectedClinicId(): string | null {
    return this.contextSubject.value.clinicId;
  }

  getSubscriptionId(): string | null {
    return this.contextSubject.value.subscriptionId;
  }

  /**
   * Returns the subscription ID or throws if not set.
   * Use this in services that MUST have a subscription context to function.
   */
  requireSubscriptionId(): string {
    const subId = this.contextSubject.value.subscriptionId;
    if (!subId) {
      console.warn('[ClinicContext] requireSubscriptionId() called with NO subscription set!',
        'This will throw. Ensure login flow calls setClinicContext before navigating.');
      throw new Error('Subscription context not set. Please log in again.');
    }
    return subId;
  }

  /**
   * Returns the Firestore collection path for a subcollection under the subscription.
   * e.g. getSubscriptionCollectionPath('patients') → 'subscriptions/sub_01/patients'
   */
  getSubscriptionCollectionPath(subcollection: string): string {
    const subId = this.requireSubscriptionId();
    return `subscriptions/${subId}/${subcollection}`;
  }

  setClinicContext(clinicId: string | null, subscriptionId: string | null, emitSwitch = false): void {
    this.contextSubject.next({ clinicId, subscriptionId });
    this.writeSession(SS_CLINIC_ID, clinicId);
    this.writeSession(SS_SUB_ID, subscriptionId);
    if (emitSwitch && clinicId) {
      this.clinicSwitch$.next(clinicId);
    }
  }

  clear(): void {

    this.contextSubject.next({ clinicId: null, subscriptionId: null });
    try {
      sessionStorage.removeItem(SS_CLINIC_ID);
      sessionStorage.removeItem(SS_SUB_ID);
    } catch { /* ignore */ }
  }

  private readSession(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }

  private writeSession(key: string, value: string | null): void {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch { /* ignore */ }
  }
}
