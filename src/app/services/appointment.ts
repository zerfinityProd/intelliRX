import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { Appointment } from '../models/appointment.model';

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private db = getFirestore();
  private appointmentsCollection = collection(this.db, 'appointments');

  private appointmentsSubject = new BehaviorSubject<Appointment[]>([]);
  public appointments$: Observable<Appointment[]> = this.appointmentsSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  /**
   * Create a new appointment
   */
  async createAppointment(appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const appointmentDoc = doc(this.appointmentsCollection);
      
      const appointment: Appointment = {
        ...appointmentData,
        id: appointmentDoc.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(appointmentDoc, this.convertToFirestore(appointment));
      console.log('✅ Appointment created:', appointmentDoc.id);
      
      return appointmentDoc.id;
    } catch (error) {
      console.error('Error creating appointment:', error);
      throw error;
    }
  }

  /**
   * Get all appointments
   */
  async getAllAppointments(): Promise<Appointment[]> {
    try {
      const q = query(
        this.appointmentsCollection,
        orderBy('appointmentDate', 'desc'),
        orderBy('appointmentTime', 'asc'),
        limit(100)
      );
      
      const querySnapshot = await getDocs(q);
      const appointments = querySnapshot.docs.map(doc => 
        this.convertFromFirestore(doc.data()) as Appointment
      );
      
      this.updateAppointments(appointments);
      return appointments;
    } catch (error) {
      console.error('Error getting appointments:', error);
      throw error;
    }
  }

  /**
   * Get appointments for a specific date
   */
  async getAppointmentsByDate(date: Date): Promise<Appointment[]> {
    try {
      // Set to start of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      // Set to end of day
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const q = query(
        this.appointmentsCollection,
        where('appointmentDate', '>=', startOfDay),
        where('appointmentDate', '<=', endOfDay),
        orderBy('appointmentDate', 'asc'),
        orderBy('appointmentTime', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const appointments = querySnapshot.docs.map(doc => 
        this.convertFromFirestore(doc.data()) as Appointment
      );
      
      this.updateAppointments(appointments);
      return appointments;
    } catch (error) {
      console.error('Error getting appointments by date:', error);
      throw error;
    }
  }

  /**
   * Get appointments for a specific patient
   */
  async getPatientAppointments(patientId: string): Promise<Appointment[]> {
    try {
      const q = query(
        this.appointmentsCollection,
        where('patientId', '==', patientId),
        orderBy('appointmentDate', 'desc'),
        orderBy('appointmentTime', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => 
        this.convertFromFirestore(doc.data()) as Appointment
      );
    } catch (error) {
      console.error('Error getting patient appointments:', error);
      throw error;
    }
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(appointmentId: string): Promise<Appointment | null> {
    try {
      const appointmentDoc = doc(this.appointmentsCollection, appointmentId);
      const docSnap = await getDoc(appointmentDoc);
      
      if (docSnap.exists()) {
        return this.convertFromFirestore(docSnap.data()) as Appointment;
      }
      return null;
    } catch (error) {
      console.error('Error getting appointment:', error);
      throw error;
    }
  }

  /**
   * Update appointment
   */
  async updateAppointment(appointmentId: string, data: Partial<Appointment>): Promise<void> {
    try {
      const appointmentDoc = doc(this.appointmentsCollection, appointmentId);
      const updateData = {
        ...data,
        updatedAt: new Date()
      };
      
      await updateDoc(appointmentDoc, this.convertToFirestore(updateData));
      console.log('✅ Appointment updated:', appointmentId);
    } catch (error) {
      console.error('Error updating appointment:', error);
      throw error;
    }
  }

  /**
   * Get upcoming appointments (for dashboard/home page)
   */
  async getUpcomingAppointments(limitCount: number = 5): Promise<Appointment[]> {
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const q = query(
        this.appointmentsCollection,
        where('appointmentDate', '>=', now),
        where('status', '==', 'scheduled'),
        orderBy('appointmentDate', 'asc'),
        orderBy('appointmentTime', 'asc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => 
        this.convertFromFirestore(doc.data()) as Appointment
      );
    } catch (error) {
      console.error('Error getting upcoming appointments:', error);
      throw error;
    }
  }

  /**
   * Update appointments subject
   */
  private updateAppointments(appointments: Appointment[]): void {
    this.ngZone.run(() => {
      this.appointmentsSubject.next(appointments);
    });
  }

  /**
   * Convert data to Firestore format (Date to Timestamp)
   */
  private convertToFirestore(data: any): any {
    const converted: any = {};
    
    for (const key in data) {
      const value = data[key];
      
      if (value === undefined) {
        continue;
      }
      
      if (value instanceof Date) {
        converted[key] = Timestamp.fromDate(value);
      } else {
        converted[key] = value;
      }
    }
    
    return converted;
  }

  /**
   * Convert Firestore data to application format (Timestamp to Date)
   */
  private convertFromFirestore(data: any): any {
    const converted: any = {};
    
    for (const key in data) {
      if (data[key] && typeof data[key].toDate === 'function') {
        converted[key] = data[key].toDate();
      } else {
        converted[key] = data[key];
      }
    }
    
    return converted;
  }
}