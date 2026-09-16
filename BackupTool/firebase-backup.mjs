#!/usr/bin/env node

/**
 * Firebase project migration tool.
 *
 * Supports:
 * - Firestore documents, including every nested subcollection
 * - Cloud Storage objects and metadata
 * - Firebase Auth user metadata (not password hashes)
 *
 * The tool intentionally uses two distinct Firebase Admin app instances in
 * import mode, ensuring the source project is never used as a destination.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { DocumentReference, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SIZE = 500;
const USERS_PAGE_SIZE = 1_000;

function usage() {
    console.log(`
Usage:
  node firebase-backup.mjs export --service-account /path/source-key.json [--output ./backup]
  node firebase-backup.mjs import --service-account /path/destination-key.json --input ./backup [--skip-auth] [--skip-storage]

Notes:
  - Storage is exported only when the source service-account project has a
    default bucket configured.
  - Auth import restores user metadata but cannot restore passwords through
    the Admin SDK. Use reset links after migration, or Firebase's dedicated
    auth export/import workflow when password-hash parameters are available.
`);
}

function parseArgs(args) {
    const values = {};
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (!argument.startsWith('--')) continue;
        const key = argument.slice(2);
        const next = args[index + 1];
        values[key] = next && !next.startsWith('--') ? next : true;
        if (values[key] !== true) index += 1;
    }
    return values;
}

async function readServiceAccount(serviceAccountPath) {
    if (!serviceAccountPath || serviceAccountPath === true) {
        throw new Error('--service-account is required.');
    }

    const source = await fs.readFile(path.resolve(serviceAccountPath), 'utf8');
    const serviceAccount = JSON.parse(source);
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('The service-account file is incomplete.');
    }
    return serviceAccount;
}

function createApp(name, serviceAccount) {
    return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: `${serviceAccount.project_id}.appspot.com`,
    }, name);
}

function timestampToJSON(value) {
    return value?.toDate?.().toISOString() ?? null;
}

function serializeValue(value) {
    if (value instanceof Timestamp) {
        return { __type: 'timestamp', value: value.toDate().toISOString() };
    }
    if (value instanceof GeoPoint) {
        return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    }
    if (value instanceof DocumentReference) {
        return { __type: 'reference', path: value.path };
    }
    if (Buffer.isBuffer(value)) {
        return { __type: 'bytes', value: value.toString('base64') };
    }
    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
    }
    return value;
}

function deserializeValue(value, firestore) {
    if (Array.isArray(value)) {
        return value.map(item => deserializeValue(item, firestore));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (value.__type === 'timestamp') {
        return Timestamp.fromDate(new Date(value.value));
    }
    if (value.__type === 'geopoint') {
        return new GeoPoint(value.latitude, value.longitude);
    }
    if (value.__type === 'reference') {
        return firestore.doc(value.path);
    }
    if (value.__type === 'bytes') {
        return Buffer.from(value.value, 'base64');
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, deserializeValue(item, firestore)])
    );
}

async function ensureEmptyDirectory(directory) {
    await fs.mkdir(directory, { recursive: true });
    const entries = await fs.readdir(directory);
    if (entries.length > 0) {
        throw new Error(`Output directory is not empty: ${directory}`);
    }
}

async function exportFirestore(firestore, outputDirectory) {
    const documents = [];
    let count = 0;

    async function walkCollection(collectionReference) {
        const snapshot = await collectionReference.get();
        for (const document of snapshot.docs) {
            documents.push({
                path: document.ref.path,
                createTime: timestampToJSON(document.createTime),
                updateTime: timestampToJSON(document.updateTime),
                data: serializeValue(document.data()),
            });
            count += 1;

            const subcollections = await document.ref.listCollections();
            for (const subcollection of subcollections) {
                await walkCollection(subcollection);
            }
        }
    }

    const collections = await firestore.listCollections();
    for (const collection of collections) {
        await walkCollection(collection);
    }

    await fs.writeFile(
        path.join(outputDirectory, 'firestore.json'),
        JSON.stringify({ exportedAt: new Date().toISOString(), documentCount: count, documents }, null, 2)
    );
    return count;
}

async function exportAuth(auth, outputDirectory) {
    const users = [];
    let pageToken;

    do {
        const page = await auth.listUsers(USERS_PAGE_SIZE, pageToken);
        for (const user of page.users) {
            users.push({
                uid: user.uid,
                email: user.email,
                emailVerified: user.emailVerified,
                displayName: user.displayName,
                photoURL: user.photoURL,
                phoneNumber: user.phoneNumber,
                disabled: user.disabled,
                customClaims: user.customClaims,
                providerData: user.providerData.map(provider => ({
                    uid: provider.uid,
                    email: provider.email,
                    displayName: provider.displayName,
                    photoURL: provider.photoURL,
                    providerId: provider.providerId,
                    phoneNumber: provider.phoneNumber,
                })),
            });
        }
        pageToken = page.pageToken;
    } while (pageToken);

    await fs.writeFile(
        path.join(outputDirectory, 'auth-users.json'),
        JSON.stringify({
            exportedAt: new Date().toISOString(),
            userCount: users.length,
            passwordHashesIncluded: false,
            users,
        }, null, 2)
    );
    return users.length;
}

async function exportStorage(bucket, outputDirectory) {
    const storageDirectory = path.join(outputDirectory, 'storage');
    await fs.mkdir(storageDirectory, { recursive: true });

    const [files] = await bucket.getFiles({ autoPaginate: true });
    const objects = [];

    for (const file of files) {
        const destination = path.join(storageDirectory, ...file.name.split('/'));
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await file.download({ destination });

        const [metadata] = await file.getMetadata();
        objects.push({
            name: file.name,
            contentType: metadata.contentType ?? null,
            cacheControl: metadata.cacheControl ?? null,
            contentDisposition: metadata.contentDisposition ?? null,
            contentEncoding: metadata.contentEncoding ?? null,
            contentLanguage: metadata.contentLanguage ?? null,
            metadata: metadata.metadata ?? {},
        });
    }

    await fs.writeFile(
        path.join(outputDirectory, 'storage.json'),
        JSON.stringify({ exportedAt: new Date().toISOString(), objectCount: objects.length, objects }, null, 2)
    );
    return objects.length;
}

async function readJSON(inputDirectory, fileName) {
    const contents = await fs.readFile(path.join(inputDirectory, fileName), 'utf8');
    return JSON.parse(contents);
}

async function importFirestore(firestore, inputDirectory) {
    const backup = await readJSON(inputDirectory, 'firestore.json');
    const documents = backup.documents ?? [];
    let batch = firestore.batch();
    let inBatch = 0;

    for (const document of documents) {
        batch.set(firestore.doc(document.path), deserializeValue(document.data, firestore));
        inBatch += 1;

        if (inBatch === PAGE_SIZE) {
            await batch.commit();
            batch = firestore.batch();
            inBatch = 0;
        }
    }
    if (inBatch > 0) {
        await batch.commit();
    }
    return documents.length;
}

async function importAuth(auth, inputDirectory) {
    const backup = await readJSON(inputDirectory, 'auth-users.json');
    let imported = 0;

    for (const user of backup.users ?? []) {
        const userRecord = {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            displayName: user.displayName,
            photoURL: user.photoURL,
            phoneNumber: user.phoneNumber,
            disabled: user.disabled,
        };

        try {
            await auth.createUser(userRecord);
        } catch (error) {
            if (error.code === 'auth/uid-already-exists') {
                await auth.updateUser(user.uid, userRecord);
            } else if (error.code === 'auth/email-already-exists') {
                throw new Error(
                    `Cannot import ${user.uid}: ${user.email} already belongs to a different destination user.`
                );
            } else {
                throw error;
            }
        }

        if (user.customClaims) {
            await auth.setCustomUserClaims(user.uid, user.customClaims);
        }
        imported += 1;
    }
    return imported;
}

async function importStorage(bucket, inputDirectory) {
    const backup = await readJSON(inputDirectory, 'storage.json');
    let imported = 0;

    for (const object of backup.objects ?? []) {
        const source = path.join(inputDirectory, 'storage', ...object.name.split('/'));
        await bucket.upload(source, {
            destination: object.name,
            metadata: {
                contentType: object.contentType ?? undefined,
                cacheControl: object.cacheControl ?? undefined,
                contentDisposition: object.contentDisposition ?? undefined,
                contentEncoding: object.contentEncoding ?? undefined,
                contentLanguage: object.contentLanguage ?? undefined,
                metadata: object.metadata ?? {},
            },
        });
        imported += 1;
    }
    return imported;
}

async function exportProject(serviceAccountPath, outputPath) {
    const serviceAccount = await readServiceAccount(serviceAccountPath);
    const outputDirectory = path.resolve(outputPath ?? path.join(__dirname, 'backup', `${serviceAccount.project_id}-${Date.now()}`));
    await ensureEmptyDirectory(outputDirectory);

    const app = createApp('source', serviceAccount);
    const firestore = getFirestore(app);
    const auth = getAuth(app);
    const bucket = getStorage(app).bucket();

    const manifest = {
        version: 1,
        sourceProjectId: serviceAccount.project_id,
        exportedAt: new Date().toISOString(),
        firestoreDocuments: await exportFirestore(firestore, outputDirectory),
        authUsers: await exportAuth(auth, outputDirectory),
        storageObjects: 0,
        authPasswords: 'not-exported',
    };

    try {
        manifest.storageObjects = await exportStorage(bucket, outputDirectory);
    } catch (error) {
        manifest.storageError = error.message;
        console.warn(`Storage export skipped: ${error.message}`);
    }

    await fs.writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await deleteApp(app);
    console.log(`Export complete: ${outputDirectory}`);
    console.log(JSON.stringify(manifest, null, 2));
}

async function importProject(serviceAccountPath, inputPath, options) {
    const serviceAccount = await readServiceAccount(serviceAccountPath);
    const inputDirectory = path.resolve(inputPath);
    const manifest = await readJSON(inputDirectory, 'manifest.json');

    if (manifest.sourceProjectId === serviceAccount.project_id) {
        throw new Error('Refusing to import into the same Firebase project used for the export.');
    }

    const app = createApp('destination', serviceAccount);
    const firestore = getFirestore(app);
    const auth = getAuth(app);
    const bucket = getStorage(app).bucket();

    const result = {
        sourceProjectId: manifest.sourceProjectId,
        destinationProjectId: serviceAccount.project_id,
        firestoreDocuments: await importFirestore(firestore, inputDirectory),
        authUsers: 0,
        storageObjects: 0,
    };

    if (!options['skip-auth']) {
        result.authUsers = await importAuth(auth, inputDirectory);
    }
    if (!options['skip-storage']) {
        try {
            result.storageObjects = await importStorage(bucket, inputDirectory);
        } catch (error) {
            console.warn(`Storage import skipped: ${error.message}`);
        }
    }

    await deleteApp(app);
    console.log('Import complete:');
    console.log(JSON.stringify(result, null, 2));
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const options = parseArgs(rest);

    if (!command || command === '--help' || command === 'help') {
        usage();
        return;
    }

    if (command === 'export') {
        await exportProject(options['service-account'], options.output);
        return;
    }

    if (command === 'import') {
        if (!options.input || options.input === true) {
            throw new Error('--input is required for import.');
        }
        await importProject(options['service-account'], options.input, options);
        return;
    }

    usage();
    process.exitCode = 1;
}

main().catch(error => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
});
