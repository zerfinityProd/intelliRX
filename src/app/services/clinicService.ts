// src/app/services/clinicService.ts
import { Injectable, inject } from '@angular/core';
import { ClinicRepository } from '../repositories/interfaces/clinic.repository';
import { ClinicContextService } from './clinicContextService';
import { Clinic, ClinicSchedule } from '../models/clinic.model';

/**
 * ClinicService — thin orchestration layer over ClinicRepository.
 * Never imports FirestoreApiService or any Firebase class.
 */
@Injectable({ providedIn: 'root' })
export class ClinicService {

  private clinicRepo = inject(ClinicRepository);
  private clinicContext = inject(ClinicContextService);

  private getSubscriptionId(): string {
    return this.clinicContext.requireSubscriptionId();
  }

  // ─── READ ───

  async getClinics(): Promise<Clinic[]> {
    try {
      const subId = this.getSubscriptionId();
      return await this.clinicRepo.getClinics(subId);
    } catch (error) {
      console.error('Error fetching clinics:', error);
      throw error;
    }
  }

  async getClinicById(clinicId: string): Promise<Clinic | null> {
    try {
      return await this.clinicRepo.getClinicById(clinicId);
    } catch (error) {
      console.error('Error fetching clinic by ID:', error);
      throw error;
    }
  }

  async getClinicName(clinicId: string): Promise<string> {
    return this.clinicRepo.getClinicName(clinicId);
  }

  // ─── CREATE ───

  async createClinic(
    clinicData: Omit<Clinic, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    try {
      const id = await this.clinicRepo.createClinic(clinicData);
      console.debug('[Clinic] Created:', id);
      return id;
    } catch (error) {
      console.error('Error creating clinic:', error);
      throw error;
    }
  }

  // ─── UPDATE ───

  async updateClinic(clinicId: string, updates: Partial<Clinic>): Promise<void> {
    try {
      await this.clinicRepo.updateClinic(clinicId, updates);
      console.debug('[Clinic] Updated:', clinicId);
    } catch (error) {
      console.error('Error updating clinic:', error);
      throw error;
    }
  }

  // ─── SCHEDULE ───

  async getClinicSchedule(clinicId: string): Promise<ClinicSchedule | null> {
    return this.clinicRepo.getClinicSchedule(clinicId);
  }

  async setClinicSchedule(clinicId: string, schedule: ClinicSchedule): Promise<void> {
    return this.clinicRepo.setClinicSchedule(clinicId, schedule);
  }

  invalidateCache(): void {
    this.clinicRepo.invalidateCache();
  }
}
