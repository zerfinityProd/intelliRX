import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ClinicRepository } from '../../repositories/interfaces/clinic.repository';
import { SubscriptionRepository } from '../../repositories/interfaces/subscription.repository';
import { ClinicContextService } from '../../services/clinicContextService';

export interface SelectorOption {
    id: string;
    label: string;
    sublabel?: string;
    initials: string;
    colorIndex: number;
}

export interface ClinicSelectorState {
    mode: 'subscription' | 'clinic';
    ids: string[];
    /** After subscription is picked (for clinic mode only) */
    subscriptionId?: string;
    /** Called once selection is complete — navigate here */
    returnUrl?: string;
}

@Component({
    selector: 'app-clinic-selector',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './clinic-selector.html',
    styleUrl: './clinic-selector.css'
})
export class ClinicSelectorComponent implements OnInit {

    private readonly router = inject(Router);
    private readonly clinicRepo = inject(ClinicRepository);
    private readonly subscriptionRepo = inject(SubscriptionRepository);
    private readonly clinicContextService = inject(ClinicContextService);
    private readonly cdr = inject(ChangeDetectorRef);

    options: SelectorOption[] = [];
    selectedId: string | null = null;
    isLoading = true;
    isConfirming = false;
    mode: 'subscription' | 'clinic' = 'clinic';
    private state!: ClinicSelectorState;

    /** Accent colors cycled for each option avatar */
    private readonly COLORS = ['#148D9E', '#0E6877', '#1CB5C9', '#2ecc71', '#9b59b6', '#e67e22'];

    async ngOnInit(): Promise<void> {
        const nav = this.router.getCurrentNavigation();
        const state = nav?.extras?.state as ClinicSelectorState | undefined
            // fallback: navigation already resolved, check history state
            ?? (history.state as ClinicSelectorState | undefined);

        if (!state?.ids?.length) {
            // No valid state — go back to login
            this.router.navigate(['/app/login']);
            return;
        }

        this.state = state;
        this.mode = state.mode;
        await this.loadOptions(state);
        this.isLoading = false;
        this.cdr.detectChanges();
    }

    get title(): string {
        return this.mode === 'subscription' ? 'Choose Organisation' : 'Choose Clinic';
    }

    get subtitle(): string {
        return this.mode === 'subscription'
            ? 'You belong to multiple organisations. Which one would you like to use?'
            : 'You are assigned to multiple clinics. Which one would you like to use?';
    }

    select(id: string): void {
        this.selectedId = id;
        this.cdr.detectChanges();
    }

    async confirm(): Promise<void> {
        if (!this.selectedId || this.isConfirming) return;
        this.isConfirming = true;
        this.cdr.detectChanges();

        if (this.mode === 'subscription') {
            // Navigate to clinic selection within chosen subscription
            const clinicsInSub = (this.state as any)['allAssignments']
                ?.filter((a: any) => a.subscriptionId === this.selectedId)
                ?.map((a: any) => a.clinicId) ?? [];

            if (clinicsInSub.length === 1) {
                this.clinicContextService.setClinicContext(clinicsInSub[0], this.selectedId);
                this.navigateToApp();
            } else if (clinicsInSub.length > 1) {
                // Proceed to clinic selection
                const nextState: ClinicSelectorState = {
                    mode: 'clinic',
                    ids: clinicsInSub,
                    subscriptionId: this.selectedId,
                    returnUrl: this.state.returnUrl,
                    ...(this.state as any)
                };
                this.router.navigate(['/app/select-clinic'], { state: nextState });
            } else {
                // Fallback: no clinics found under this subscription
                this.clinicContextService.setClinicContext(null, this.selectedId);
                this.navigateToApp();
            }
        } else {
            // Clinic mode
            this.clinicContextService.setClinicContext(
                this.selectedId,
                this.state.subscriptionId ?? null
            );
            this.navigateToApp();
        }
    }

    private navigateToApp(): void {
        const url = this.state.returnUrl ?? '/home';
        this.router.navigateByUrl(url);
    }

    private async loadOptions(state: ClinicSelectorState): Promise<void> {
        const ids = state.ids;
        const results: SelectorOption[] = [];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            try {
                if (state.mode === 'subscription') {
                    const summary = await this.subscriptionRepo.getSubscriptionSummary(id);
                    const label = summary?.name || id;
                    results.push({
                        id,
                        label,
                        initials: this.getInitials(label),
                        colorIndex: i % this.COLORS.length
                    });
                } else {
                    const summary = await this.clinicRepo.getClinicSummary(id);
                    const label = summary?.name || id;
                    const sublabel = summary?.address ?? undefined;
                    results.push({
                        id,
                        label,
                        sublabel,
                        initials: this.getInitials(label),
                        colorIndex: i % this.COLORS.length
                    });
                }
            } catch {
                results.push({
                    id,
                    label: id,
                    initials: '?',
                    colorIndex: i % this.COLORS.length
                });
            }
        }

        this.options = results;
    }

    getColor(index: number): string {
        return this.COLORS[index % this.COLORS.length];
    }

    private getInitials(name: string): string {
        const words = name.trim().split(/\s+/);
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }
}
