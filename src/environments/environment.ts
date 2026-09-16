
export const environment = {
  production: false,
  firebase: {
  apiKey: "AIzaSyC1tWaoSCZLJ2iayhfL3dqOr2lb6IXjQW0",
  authDomain: "intellirx-test.firebaseapp.com",
  projectId: "intellirx-test",
  storageBucket: "intellirx-test.firebasestorage.app",
  messagingSenderId: "143213488063",
  appId: "1:143213488063:web:e88b8d09640113750fe30a",
  measurementId: "G-YPK8C0V09T"
  },
  // ── WhatsApp Cloudflare Worker ─────────────────────────────────────────────
  whatsappWorkerUrl: 'https://intellirx-whatsapp-worker.intellirx.workers.dev',
  whatsappWorkerSecret: 'intellirx@2026'   // must match WORKER_SECRET set via wrangler secret
};

