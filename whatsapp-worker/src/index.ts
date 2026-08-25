export interface Env {
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  WORKER_SECRET: string;
}

const metaApiUrl = (phoneNumberId: string) =>
  `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Security check — only IntelliRX Angular app can call this worker
    const secret = request.headers.get('X-Worker-Secret');
    if (secret !== env.WORKER_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    let body: any;

    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }

    try {
      if (url.pathname === '/notify/appointment') {
        await sendAppointmentNotification(body, env);

      } else if (url.pathname === '/notify/prescription') {
        await sendPrescriptionNotification(body, env);

      } else {
        return new Response('Not found', { status: 404 });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// ─── Appointment Confirmation ─────────────────────────────────────────────────
// Template: appointment_confirmation
// Variables: {{1}} patientName, {{2}} doctorName (no Dr. prefix),
//            {{3}} clinicName, {{4}} date, {{5}} time, {{6}} address
async function sendAppointmentNotification(data: any, env: Env): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    to: data.phone,          // E.164 format e.g. "919876543210"
    type: 'template',
    template: {
      name: 'appointment_confirmation',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.patientName  || 'Patient' },
            { type: 'text', text: data.doctorName   || 'your doctor' },
            { type: 'text', text: data.clinicName   || 'the clinic' },
            { type: 'text', text: data.date         || '' },
            { type: 'text', text: data.time         || '' },
            { type: 'text', text: data.address      || 'Address not available' },
          ]
        }
      ]
    }
  };

  await callMetaApi(payload, env);
}

// ─── Prescription Ready ───────────────────────────────────────────────────────
// Template: prescription_ready
// Variables: {{1}} patientName, {{2}} doctorName (no Dr. prefix),
//            {{3}} clinicName, {{4}} pdfUrl
async function sendPrescriptionNotification(data: any, env: Env): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    to: data.phone,
    type: 'template',
    template: {
      name: 'prescription_ready',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.patientName || 'Patient' },
            { type: 'text', text: data.doctorName  || 'your doctor' },
            { type: 'text', text: data.clinicName  || 'the clinic' },
            { type: 'text', text: data.pdfUrl      || '' },
          ]
        }
      ]
    }
  };

  await callMetaApi(payload, env);
}

// ─── Meta Cloud API caller ────────────────────────────────────────────────────
async function callMetaApi(payload: object, env: Env): Promise<void> {
  const response = await fetch(metaApiUrl(env.WA_PHONE_NUMBER_ID), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta API ${response.status}: ${errorBody}`);
  }
}
