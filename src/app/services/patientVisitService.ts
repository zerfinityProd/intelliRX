import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase';
import { Visit } from '../models/patient.model';

/**
 * Manages patient visit operations
 * Handles visit CRUD operations for a patient
 */
@Injectable({
    providedIn: 'root'
})
export class PatientVisitService {
    constructor(private firebaseService: FirebaseService) { }

    /**
     * Add a new visit for a patient
     */
    async addVisit(
        patientId: string,
        visitData: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>,
        userId: string
    ): Promise<string> {
        try {
            const visitId = await this.firebaseService.addVisit(patientId, visitData, userId);
            console.log('✓ Visit added successfully:', visitId);
            return visitId;
        } catch (error) {
            console.error('❌ Error adding visit:', error);
            throw error;
        }
    }

    /**
     * Get all visits for a patient
     */
    async getVisits(patientId: string, userId: string): Promise<Visit[]> {
        try {
            const visits = await this.firebaseService.getPatientVisits(patientId, userId);
            return visits;
        } catch (error) {
            console.error('❌ Error fetching visits:', error);
            return [];
        }
    }

    /**
     * Delete a visit
     */
    async deleteVisit(patientId: string, visitId: string, userId: string): Promise<void> {
        try {
            await this.firebaseService.deleteVisit(patientId, visitId, userId);
            console.log('✓ Visit deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting visit:', error);
            throw error;
        }
    }
}
