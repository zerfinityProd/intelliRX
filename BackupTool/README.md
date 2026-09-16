# IntelliRX Firebase Backup Tool

A standalone Node.js export/import tool for the Firebase services used by IntelliRX:

- Firestore, including every document and nested subcollection
- Cloud Storage objects and their common metadata
- Firebase Authentication user metadata and custom claims

## Prerequisites

Use Node.js 20 or newer. Create a service-account JSON key for each project in Google Cloud IAM. Keep both key files outside this repository.

```sh
cd BackupTool
npm install
```

## Export the source project

```sh
npm run export -- --service-account /secure/source-service-account.json --output ./backup/source-2026-09-16
```

The output directory must be new or empty. It contains:

```text
manifest.json
firestore.json
auth-users.json
storage.json
storage/...
```

Keep the export encrypted and out of source control: it may contain patient data.

## Import into a different project

Create the destination Firebase project first, enable Firestore/Auth/Storage as needed, and create a destination service-account key.

```sh
npm run import -- --service-account /secure/destination-service-account.json --input ./backup/source-2026-09-16
```

The tool refuses to import into the same project ID recorded in the export manifest.

Use `--skip-auth` or `--skip-storage` to leave those services untouched.

## Authentication limitation

The Firebase Admin SDK can list users but does **not** export their password hashes. This tool restores user IDs, email addresses, verification status, profile fields, disabled status, and custom claims. Existing email/password users must reset their passwords after import.

For a zero-reset migration of email/password credentials, use Firebase's official Auth export/import process with the source project's password-hash algorithm and parameters, then run this tool with `--skip-auth`.

## Safety notes

- Run the import against an empty destination Firestore database unless you explicitly intend to overwrite documents with matching paths.
- Review and deploy destination Firestore Security Rules, Storage Rules, indexes, Firebase Authentication providers, authorized domains, Cloud Functions, and Cloudflare Worker secrets separately. Firebase Admin data APIs do not migrate these project settings.
- Back up and restore Firebase Realtime Database separately; this Angular app does not use it.
