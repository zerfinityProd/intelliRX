export interface User {
    uid: string;
    name: string;
    email: string;
    phone?: string;
    photoURL?: string;
    global_roles?: string[];    // e.g. ["doctor"]
    permissions?: string[];     // per-user permission overrides (e.g. ["canDelete","canEdit"])
    status?: 'active' | 'inactive';
    created_at?: string;        // ISO datetime
    updated_at?: string;        // ISO datetime
}