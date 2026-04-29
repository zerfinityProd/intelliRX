import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthTokenService } from './auth-token.service';
import { environment } from '../../../environments/environment';

// ─── Public types ─────────────────────────────────────────────

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';
  value: any;
}

export interface OrderByClause {
  field: string;
  direction?: 'ASCENDING' | 'DESCENDING';
}

export interface StructuredQueryConfig {
  collectionId: string;
  filters?: QueryFilter[];
  orderBy?: OrderByClause[];
  limit?: number;
  /** Cursor values matching orderBy fields for startAfter pagination */
  startAfterValues?: any[];
}

export interface DocumentResult {
  id: string;
  data: any;
  /** Full document path — used for pagination cursors */
  path: string;
}

/** Sentinel value — pass as a field value to delete that field during updateDocument */
export const DELETE_FIELD = Symbol('DELETE_FIELD');

// ─── Operator map ─────────────────────────────────────────────

const OP_MAP: Record<string, string> = {
  '==': 'EQUAL',
  '!=': 'NOT_EQUAL',
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
  '>=': 'GREATER_THAN_OR_EQUAL',
  'array-contains': 'ARRAY_CONTAINS',
  'in': 'IN',
};

// ─── Service ──────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FirestoreApiService {
  private http = inject(HttpClient);
  private authToken = inject(AuthTokenService);

  private readonly projectId = environment.firebase.projectId;
  private readonly BASE =
    `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;

  // ── Auth headers ──────────────────────────────────────────

  private async headers(): Promise<HttpHeaders> {
    const token = await this.authToken.getToken();
    let h = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  // ── Document CRUD ─────────────────────────────────────────

  /** GET a single document. Returns null if not found. */
  async getDocument(collectionPath: string, docId: string): Promise<DocumentResult | null> {
    const url = `${this.BASE}/${collectionPath}/${docId}`;
    try {
      const raw: any = await firstValueFrom(
        this.http.get(url, { headers: await this.headers() })
      );
      return this.parseDocResponse(raw);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  /**
   * CREATE a document with an auto-generated or explicit ID.
   * Returns the new document ID.
   */
  async createDocument(collectionPath: string, data: any, docId?: string): Promise<string> {
    const id = docId || this.generateDocId();
    const url = `${this.BASE}/${collectionPath}?documentId=${id}`;
    const body = { fields: this.toFields(data) };
    await firstValueFrom(
      this.http.post(url, body, { headers: await this.headers() })
    );
    return id;
  }

  /**
   * SET (create or overwrite) a document at a specific path.
   * With merge=true only the provided fields are updated (upsert).
   */
  async setDocument(
    collectionPath: string, docId: string, data: any, merge = false
  ): Promise<void> {
    let url = `${this.BASE}/${collectionPath}/${docId}`;
    if (merge) {
      const fieldPaths = this.flatFieldPaths(data);
      const mask = fieldPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
      url += `?${mask}`;
    }
    const body = { fields: this.toFields(data) };
    await firstValueFrom(
      this.http.patch(url, body, { headers: await this.headers() })
    );
  }

  /**
   * PATCH a document (partial update). Only the provided fields are updated.
   * Pass field names in `fieldsToDelete` to remove them from the document.
   */
  async updateDocument(
    collectionPath: string, docId: string, data: any, fieldsToDelete?: string[]
  ): Promise<void> {
    // Separate real fields from DELETE_FIELD sentinels
    const realData: any = {};
    const deleteFields: string[] = [...(fieldsToDelete || [])];
    for (const key of Object.keys(data)) {
      if (data[key] === DELETE_FIELD) {
        deleteFields.push(key);
      } else {
        realData[key] = data[key];
      }
    }

    const allPaths = [...Object.keys(realData), ...deleteFields];
    const mask = allPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const url = `${this.BASE}/${collectionPath}/${docId}?${mask}`;
    const body = { fields: this.toFields(realData) };
    await firstValueFrom(
      this.http.patch(url, body, { headers: await this.headers() })
    );
  }

  /** DELETE a document. */
  async deleteDocument(collectionPath: string, docId: string): Promise<void> {
    const url = `${this.BASE}/${collectionPath}/${docId}`;
    await firstValueFrom(
      this.http.delete(url, { headers: await this.headers() })
    );
  }

  // ── Queries ───────────────────────────────────────────────

  /**
   * Run a structured query against a collection.
   * `parentPath` is the parent document path (empty string for root collections).
   */
  async runQuery(parentPath: string, cfg: StructuredQueryConfig): Promise<DocumentResult[]> {
    const parent = parentPath
      ? `${this.BASE}/${parentPath}`
      : this.BASE;
    const url = `${parent}:runQuery`;

    const sq: any = {
      from: [{ collectionId: cfg.collectionId }],
    };

    // WHERE
    if (cfg.filters && cfg.filters.length > 0) {
      sq.where = this.buildWhere(cfg.filters);
    }

    // ORDER BY
    if (cfg.orderBy && cfg.orderBy.length > 0) {
      sq.orderBy = cfg.orderBy.map(o => ({
        field: { fieldPath: o.field },
        direction: o.direction || 'ASCENDING',
      }));
    }

    // LIMIT
    if (cfg.limit != null) {
      sq.limit = cfg.limit;
    }

    // START AFTER (pagination cursor)
    if (cfg.startAfterValues && cfg.startAfterValues.length > 0) {
      sq.startAt = {
        values: cfg.startAfterValues.map(v => this.toValue(v)),
        before: false, // false = startAfter
      };
    }

    const body = { structuredQuery: sq };
    const raw: any[] = await firstValueFrom(
      this.http.post<any[]>(url, body, { headers: await this.headers() })
    );

    // The response is an array; entries with a `document` key are results.
    return (raw || [])
      .filter(r => r.document)
      .map(r => this.parseDocResponse(r.document));
  }

  /**
   * Run an aggregation query to get a count of matching documents.
   */
  async runCount(parentPath: string, cfg: StructuredQueryConfig): Promise<number> {
    const parent = parentPath
      ? `${this.BASE}/${parentPath}`
      : this.BASE;
    const url = `${parent}:runAggregationQuery`;

    const sq: any = {
      from: [{ collectionId: cfg.collectionId }],
    };
    if (cfg.filters && cfg.filters.length > 0) {
      sq.where = this.buildWhere(cfg.filters);
    }

    const body = {
      structuredAggregationQuery: {
        structuredQuery: sq,
        aggregations: [{ count: {}, alias: 'count' }],
      },
    };

    const raw: any[] = await firstValueFrom(
      this.http.post<any[]>(url, body, { headers: await this.headers() })
    );

    const entry = raw?.find(r => r.result?.aggregateFields?.count);
    if (!entry) return 0;
    return parseInt(entry.result.aggregateFields.count.integerValue || '0', 10);
  }

  /**
   * List all documents in a collection (no filtering).
   */
  async listDocuments(collectionPath: string, pageSize = 300): Promise<DocumentResult[]> {
    const url = `${this.BASE}/${collectionPath}?pageSize=${pageSize}`;
    const raw: any = await firstValueFrom(
      this.http.get(url, { headers: await this.headers() })
    );
    if (!raw?.documents) return [];
    return raw.documents.map((d: any) => this.parseDocResponse(d));
  }

  // ── Value conversion: JS ↔ Firestore REST format ──────────

  /** Convert a plain JS value to Firestore REST value wrapper */
  toValue(value: any): any {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    }
    if (typeof value === 'string') return { stringValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map(v => this.toValue(v)) } };
    }
    if (typeof value === 'object') {
      return { mapValue: { fields: this.toFields(value) } };
    }
    return { stringValue: String(value) };
  }

  /** Convert a Firestore REST value wrapper to a plain JS value */
  fromValue(v: any): any {
    if (v == null) return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue; // keep as ISO string
    if ('bytesValue' in v) return v.bytesValue;
    if ('referenceValue' in v) return v.referenceValue;
    if ('geoPointValue' in v) return v.geoPointValue;
    if ('arrayValue' in v) {
      return (v.arrayValue?.values || []).map((i: any) => this.fromValue(i));
    }
    if ('mapValue' in v) {
      return this.fromFields(v.mapValue?.fields || {});
    }
    return null;
  }

  /** Convert a plain JS object to Firestore fields map */
  toFields(obj: any): any {
    const fields: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) continue;
      if (obj[key] === DELETE_FIELD) continue;
      fields[key] = this.toValue(obj[key]);
    }
    return fields;
  }

  /** Convert a Firestore fields map to a plain JS object */
  fromFields(fields: any): any {
    const obj: any = {};
    if (!fields) return obj;
    for (const key of Object.keys(fields)) {
      obj[key] = this.fromValue(fields[key]);
    }
    return obj;
  }

  // ── Internals ─────────────────────────────────────────────

  private parseDocResponse(raw: any): DocumentResult {
    const fullPath: string = raw.name || '';
    // Path format: projects/{p}/databases/(default)/documents/{collectionPath}/{docId}
    const docPath = fullPath.replace(
      `projects/${this.projectId}/databases/(default)/documents/`, ''
    );
    const parts = docPath.split('/');
    const id = parts[parts.length - 1] || '';
    return {
      id,
      data: this.fromFields(raw.fields || {}),
      path: docPath,
    };
  }

  private buildWhere(filters: QueryFilter[]): any {
    const mapped = filters.map(f => ({
      fieldFilter: {
        field: { fieldPath: f.field },
        op: OP_MAP[f.op] || 'EQUAL',
        value: this.toValue(f.value),
      },
    }));
    if (mapped.length === 1) return mapped[0];
    return { compositeFilter: { op: 'AND', filters: mapped } };
  }

  private flatFieldPaths(obj: any, prefix = ''): string[] {
    const paths: string[] = [];
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
    }
    return paths;
  }

  /** Generate a 20-char random document ID (same charset as Firestore) */
  generateDocId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 20; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}
