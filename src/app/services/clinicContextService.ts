import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

type ClinicContext = {
  clinicId: string | null;
  subscriptionId: string | null;
};

const LS_CLINIC_ID = 'intellirx.selectedClinicId';
const LS_SUBSCRIPTION_ID = 'intellirx.subscriptionId';

@Injectable({ providedIn: 'root' })
export class ClinicContextService {
  private readonly contextSubject: BehaviorSubject<ClinicContext>;
  public readonly context$: Observable<ClinicContext>;

  constructor() {
    this.contextSubject = new BehaviorSubject<ClinicContext>({
      clinicId: this.readStoredClinicId(),
      subscriptionId: this.readStoredSubscriptionId()
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

  setClinicContext(clinicId: string | null, subscriptionId: string | null): void {
    const next: ClinicContext = { clinicId, subscriptionId };
    this.contextSubject.next(next);

    if (clinicId) localStorage.setItem(LS_CLINIC_ID, clinicId);
    else localStorage.removeItem(LS_CLINIC_ID);

    if (subscriptionId) localStorage.setItem(LS_SUBSCRIPTION_ID, subscriptionId);
    else localStorage.removeItem(LS_SUBSCRIPTION_ID);
  }

  clear(): void {
    this.setClinicContext(null, null);
  }

  private readStoredClinicId(): string | null {
    try {
      return localStorage.getItem(LS_CLINIC_ID);
    } catch {
      return null;
    }
  }

  private readStoredSubscriptionId(): string | null {
    try {
      return localStorage.getItem(LS_SUBSCRIPTION_ID);
    } catch {
      return null;
    }
  }
}
