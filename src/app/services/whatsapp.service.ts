// src/app/services/whatsapp.service.ts
//
// Handles all WhatsApp notification logic for IntelliRX:
//  1. Appointment confirmation → sends template message via Cloudflare Worker
//  2. Prescription → generates PDF, uploads to Firebase Storage, sends download link via Worker
//
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { environment } from '../../environments/environment';
import { Patient } from '../models/patient.model';
import { Appointment } from '../models/appointment.model';

// Country codes list for the opt-in form dropdown
export const COUNTRY_CODES = [
  { label: '🇮🇳 India (+91)',       code: '+91'  },
  { label: '🇺🇸 USA (+1)',          code: '+1'   },
  { label: '🇬🇧 UK (+44)',          code: '+44'  },
  { label: '🇦🇪 UAE (+971)',        code: '+971' },
  { label: '🇦🇺 Australia (+61)',   code: '+61'  },
  { label: '🇸🇬 Singapore (+65)',   code: '+65'  },
  { label: '🇲🇾 Malaysia (+60)',    code: '+60'  },
  { label: '🇨🇦 Canada (+1)',       code: '+1'   },
  { label: '🇩🇪 Germany (+49)',     code: '+49'  },
  { label: '🇫🇷 France (+33)',      code: '+33'  },
];

@Injectable({ providedIn: 'root' })
export class WhatsappService {

  private readonly WORKER_URL    = environment.whatsappWorkerUrl;
  private readonly WORKER_SECRET = environment.whatsappWorkerSecret;
  private readonly http = inject(HttpClient);

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send a WhatsApp appointment confirmation to the patient.
   * Silently skips if the patient has no WhatsApp consent or no phone.
   */
  async notifyAppointment(appointment: Appointment, patient: Patient): Promise<void> {
    if (!patient.whatsapp_consent) return;

    const phone = this.buildE164Phone(patient);
    if (!phone) {
      console.warn('[WhatsApp] Cannot send appointment notification: invalid phone for patient', patient.id);
      return;
    }

    // Safely parse Firestore Timestamp or ISO string to Date
    const rawDatetime = appointment.datetime as any;
    const dt: Date = rawDatetime?.seconds !== undefined
      ? new Date(rawDatetime.seconds * 1000)
      : new Date(rawDatetime);

    const date = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Strip "Dr." prefix — template already has "Dr." before {{2}}
    const rawDoctorName = appointment.doctor_name || '';
    const doctorName = rawDoctorName.replace(/^Dr\.\s*/i, '').trim() || 'your doctor';

    await this.callWorker('/notify/appointment', {
      phone,
      patientName: patient.name || 'Patient',
      doctorName,
      clinicName:  appointment.clinic_name  || 'the clinic',
      date,
      time,
      address:     'Please contact the clinic for address details',
    });
  }

  /**
   * Generate a PDF prescription, upload to Firebase Storage, and send
   * the download link to the patient's WhatsApp.
   * Silently skips if the patient has no WhatsApp consent or no phone.
   */
  async sendPrescription(
    visitData: any,
    patient:   Patient,
    doctorDisplayName: string,
    clinicName: string
  ): Promise<void> {
    if (!patient.whatsapp_consent) return;

    const phone = this.buildE164Phone(patient);
    if (!phone) {
      console.warn('[WhatsApp] Cannot send prescription: invalid phone for patient', patient.id);
      return;
    }

    // 1. Generate PDF
    const pdfBlob = await this.generatePrescriptionPDF(visitData, patient, doctorDisplayName, clinicName);

    // 2. Upload to Firebase Storage → get public URL
    const pdfUrl = await this.uploadPdfToStorage(pdfBlob, patient.id || Date.now().toString());

    // Strip "Dr." prefix — template already has "Dr." before {{2}}
    const doctorName = doctorDisplayName.replace(/^Dr\.\s*/i, '').trim() || 'your doctor';

    // 3. Call Cloudflare Worker
    await this.callWorker('/notify/prescription', {
      phone,
      patientName: patient.name || 'Patient',
      doctorName,
      clinicName:  clinicName || 'the clinic',
      pdfUrl,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build an E.164 phone string from Patient's country code + phone.
   * Returns null if the phone number is missing or malformed.
   */
  private buildE164Phone(patient: Patient): string | null {
    const rawPhone  = (patient.phone || '').trim();
    const countryCode = (patient.whatsapp_country_code || '+91').replace('+', '');
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return null;
    // If phone already starts with the country code, don't double-prefix
    if (digits.startsWith(countryCode)) return digits;
    return `${countryCode}${digits}`;
  }

  /**
   * Generate a simple prescription PDF using jsPDF.
   * Returns a Blob of the PDF file.
   */
  private async generatePrescriptionPDF(
    visitData:   any,
    patient:     Patient,
    doctorName:  string,
    clinicName:  string
  ): Promise<Blob> {
    // Dynamic import to keep jsPDF out of the main bundle
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const pageW = doc.internal.pageSize.getWidth();
    let y = 15;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.setFillColor(20, 141, 158);   // IntelliRX brand teal
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('IntelliRX', 15, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Medical Prescription', 15, 20);
    doc.text(clinicName, pageW - 15, 12, { align: 'right' });
    doc.text(doctorName, pageW - 15, 20, { align: 'right' });

    y = 38;
    doc.setTextColor(30, 41, 59);

    // ── Patient Info ─────────────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient Information', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Name:   ${patient.name || 'N/A'}`, 15, y);
    doc.text(`Date:   ${new Date().toLocaleDateString('en-IN')}`, pageW / 2, y);
    y += 5;
    doc.text(`Phone:  ${patient.phone || 'N/A'}`, 15, y);
    if (patient.dob) {
      doc.text(`DOB:    ${patient.dob}`, pageW / 2, y);
    }
    y += 8;

    // Divider
    doc.setDrawColor(20, 141, 158);
    doc.line(15, y, pageW - 15, y);
    y += 7;

    // ── Chief Complaints ────────────────────────────────────────────────────
    if (visitData.chiefComplaints) {
      doc.setFont('helvetica', 'bold');
      doc.text('Chief Complaints', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(visitData.chiefComplaints, pageW - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 4;
    }

    // ── Diagnosis ────────────────────────────────────────────────────────────
    if (visitData.diagnosis) {
      doc.setFont('helvetica', 'bold');
      doc.text('Diagnosis', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(visitData.diagnosis, pageW - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 4;
    }

    // ── Medicines ────────────────────────────────────────────────────────────
    const medicines: string[] = visitData.medicines || [];
    if (medicines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Medicines', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      medicines.forEach((med: string, i: number) => {
        doc.text(`${i + 1}. ${med}`, 18, y);
        y += 5;
      });
      y += 2;
    }

    // ── Advice ───────────────────────────────────────────────────────────────
    if (visitData.advice) {
      doc.setFont('helvetica', 'bold');
      doc.text('Advice', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(visitData.advice, pageW - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 4;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.setDrawColor(20, 141, 158);
    doc.line(15, y, pageW - 15, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('This is a computer-generated prescription from IntelliRX.', pageW / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, pageW / 2, y, { align: 'center' });

    return doc.output('blob');
  }

  /**
   * Upload a PDF Blob to Firebase Storage under the path:
   *   prescriptions/{patientId}/{timestamp}.pdf
   * Returns the public download URL.
   */
  private async uploadPdfToStorage(pdfBlob: Blob, patientId: string): Promise<string> {
    const storage  = getStorage(getApp());
    const filePath = `prescriptions/${patientId}/${Date.now()}.pdf`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' });
    return getDownloadURL(storageRef);
  }

  /**
   * POST to the Cloudflare Worker endpoint.
   * Throws on HTTP error so the caller can handle/log it.
   */
  private async callWorker(endpoint: string, body: object): Promise<void> {
    const headers = new HttpHeaders({
      'Content-Type':    'application/json',
      'X-Worker-Secret': this.WORKER_SECRET,
    });

    await firstValueFrom(
      this.http.post(`${this.WORKER_URL}${endpoint}`, body, { headers })
    );
  }
}
