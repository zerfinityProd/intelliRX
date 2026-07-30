// src/app/services/specializationService.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

export interface SpecializationMap {
  [specialization: string]: string; // specialization name → chart type (e.g. 'dental', 'cardiac')
}

export type ChartType = 'dental' | 'skeletal' | 'muscular' | 'cardiac';

@Injectable({ providedIn: 'root' })
export class SpecializationService {
  private firestore = inject(Firestore);

  /** Cache so we only hit Firestore once per session */
  private cachedMap: SpecializationMap | null = null;

  /**
   * Fetch the specialization→chart map from `specializations/field`.
   * Returns e.g. { cardiologist: 'cardiac', dentist: 'dental', ... }
   */
  async getSpecializationMap(): Promise<SpecializationMap> {
    if (this.cachedMap) return this.cachedMap;
    try {
      const ref = doc(this.firestore, 'specializations', 'field');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.cachedMap = snap.data() as SpecializationMap;
      } else {
        // Fallback defaults if document doesn't exist
        this.cachedMap = {
          cardiologist: 'cardiac',
          dentist: 'dental',
          orthopedist: 'skeletal',
          physiotherapist: 'muscular',
        };
      }
    } catch (err) {
      console.warn('[SpecializationService] Failed to load specializations, using defaults:', err);
      this.cachedMap = {
        cardiologist: 'cardiac',
        dentist: 'dental',
        orthopedist: 'skeletal',
        physiotherapist: 'muscular',
      };
    }
    return this.cachedMap!;
  }

  /**
   * Returns the list of specialization names (keys from the map).
   */
  async getSpecializationNames(): Promise<string[]> {
    const map = await this.getSpecializationMap();
    return Object.keys(map);
  }

  /**
   * Given a doctor's specialization string, resolve the chart type from DB.
   * Falls back to 'skeletal' if no match found.
   */
  async getChartTypeForSpecialization(specialization: string): Promise<ChartType> {
    if (!specialization) return 'skeletal';
    const map = await this.getSpecializationMap();
    const specLower = specialization.toLowerCase().trim();

    // Exact match first (case-insensitive key lookup)
    for (const [key, chartType] of Object.entries(map)) {
      if (key.toLowerCase() === specLower) {
        return this.validateChartType(chartType);
      }
    }

    // Partial match fallback
    for (const [key, chartType] of Object.entries(map)) {
      if (specLower.includes(key.toLowerCase()) || key.toLowerCase().includes(specLower)) {
        return this.validateChartType(chartType);
      }
    }

    return 'skeletal';
  }

  private validateChartType(value: string): ChartType {
    const valid: ChartType[] = ['dental', 'skeletal', 'muscular', 'cardiac'];
    return valid.includes(value as ChartType) ? (value as ChartType) : 'skeletal';
  }

  /** Clear cache (useful after admin updates the specializations collection) */
  clearCache(): void {
    this.cachedMap = null;
  }
}
