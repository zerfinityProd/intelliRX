import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FirebaseService } from './firebase';
import { Patient } from '../models/patient.model';

/**
 * Manages basic CRUD operations and patient selection
 * Handles fetch, create, update, delete operations and patient context
 */
@Injectable({
    providedIn: 'root'
})
export class PatientCRUDService {
    private readonly selectedPatientSubject = new BehaviorSubject<Patient | null>(null);
    selectedPatient$: Observable<Patient | null> = this.selectedPatientSubject.asObservable();

    constructor(private firebaseService: FirebaseService) { }

    /**
     * Fetch a patient by unique ID
     */
    async getPatient(uniqueId: string, userId: string): Promise<Patient | null> {
        try {
            const patient = await this.firebaseService.getPatientById(uniqueId, userId);
            if (patient) {
                this.selectedPatientSubject.next(patient);
            }
            return patient;
        } catch (error) {
            console.error('❌ Error fetching patient:', error);
            throw error;
        }
    }

    /**
     * Create a new patient or update existing
     */
    async createPatient(
        patientData: Omit<Patient, 'uniqueId' | 'userId' | 'familyId' | 'createdAt' | 'updatedAt'>,
        userId: string,
        firebaseService: FirebaseService
    ): Promise<string> {
        try {
            const existingPatient = await this.findExistingPatient(
                patientData.name,
                patientData.phone,
                userId
            );

            if (existingPatient) {
                console.log('✓ Found existing patient, updating:', existingPatient.uniqueId);
                const updateData: Partial<Patient> = {
                    name: patientData.name,
                    phone: patientData.phone,
                    email: patientData.email || existingPatient.email,
                    dateOfBirth: patientData.dateOfBirth || existingPatient.dateOfBirth,
                    gender: patientData.gender || existingPatient.gender,
                    allergies: patientData.allergies || existingPatient.allergies
                };
                await this.updatePatient(existingPatient.uniqueId, updateData, userId);
                return existingPatient.uniqueId;
            }

            const familyId = firebaseService.generateFamilyId(patientData.name, patientData.phone);
            const patientWithUserId = { ...patientData, familyId, userId };
            const uniqueId = await firebaseService.addPatient(patientWithUserId, userId);

            console.log('✓ Patient created:', uniqueId);
            return uniqueId;
        } catch (error) {
            console.error('❌ Error creating patient:', error);
            throw error;
        }
    }

    /**
     * Update an existing patient
     */
    async updatePatient(uniqueId: string, patientData: Partial<Patient>, userId: string): Promise<void> {
        try {
            await this.firebaseService.updatePatient(uniqueId, patientData, userId);
            console.log('✓ Patient updated successfully');
        } catch (error) {
            console.error('❌ Error updating patient:', error);
            throw error;
        }
    }

    /**
     * Delete a patient
     */
    async deletePatient(uniqueId: string, userId: string): Promise<void> {
        try {
            await this.firebaseService.deletePatient(uniqueId, userId);
            this.selectedPatientSubject.next(null);
            console.log('✓ Patient deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting patient:', error);
            throw error;
        }
    }

    /**
     * Select a patient for context
     */
    selectPatient(patient: Patient | null): void {
        this.selectedPatientSubject.next(patient);
    }

    /**
     * Check if a unique ID already exists
     */
    async checkUniqueIdExists(name: string, phone: string, userId: string): Promise<boolean> {
        try {
            if (!name.trim() || !phone.trim()) return false;
            const newUniqueIdFormat = `${name.replace(/\s+/g, '_').toLowerCase()}_${phone.trim().toLowerCase()}_${userId}`;
            const existingPatient = await this.findExistingPatient(name, phone, userId);
            return !!existingPatient;
        } catch (error) {
            console.error('❌ Error checking unique ID:', error);
            return false;
        }
    }

    /**
     * Check if a family ID exists
     */
    async checkFamilyIdExists(familyId: string, userId: string): Promise<boolean> {
        try {
            const normalizedFamilyId = familyId.trim().toLowerCase();
            if (!normalizedFamilyId) return false;
            const { results } = await this.firebaseService.searchPatientByFamilyId(normalizedFamilyId, userId);
            const exactMatch = results.find(p => p.familyId.toLowerCase() === normalizedFamilyId);
            return !!exactMatch;
        } catch (error) {
            console.error('❌ Error checking family ID:', error);
            return false;
        }
    }

    /**
     * Private: Find existing patient by name and phone
     */
    private async findExistingPatient(
        name: string,
        phone: string,
        userId: string
    ): Promise<Patient | null> {
        try {
            const normalizedName = name.trim().toLowerCase();
            const normalizedPhone = phone.trim();

            const { results } = await this.firebaseService.searchPatientByPhone(normalizedPhone, userId);
            if (results.length === 0) return null;

            const exactMatches = results.filter(p => p.name.trim().toLowerCase() === normalizedName);
            if (exactMatches.length === 0) return null;

            // Return most recently created match
            const sorted = exactMatches.sort((a, b) => {
                const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
                const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
            });
            return sorted[0];
        } catch (error) {
            console.error('❌ Error finding existing patient:', error);
            return null;
        }
    }
}
