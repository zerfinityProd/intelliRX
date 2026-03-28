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

