# IntelliRX → SaaS Transformation Guide

## Current vs. SaaS Architecture Comparison

### **Current: Single-Tenant Architecture**

```
┌─────────────────────────────────────────┐
│         Angular Frontend (SPAtm)         │
│  (Patient CRUD, Visits, Dashboard)      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          Firebase (/w Direct Access)    │
│  ├─ Auth (Email/Google)                 │
│  ├─ Firestore                           │
│  │  ├─ /patients/{userId}/{patientId}   │
│  │  └─ /visits/{userId}/{visitId}       │
│  └─ Cloud Storage                       │
└─────────────────────────────────────────┘

Issues:
❌ Single user per installation
❌ No team collaboration
❌ No subscription/billing
❌ No organization management
❌ No enterprise controls
```

---

### **Target: Multi-Tenant SaaS Architecture**

```
┌────────────────────────────────────────────────────────┐
│          Marketing Website + Landing Pages             │
│  (Pricing, Features, Blog, Docs)                       │
└────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Customer │    │  Admin   │    │   API    │
    │   App    │    │Dashboard │    │Docs      │
    └────┬─────┘    └────┬─────┘    └────┬─────┘
         │                │              │
         └────────────────┼──────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │    REST/GraphQL API Backend    │
         │  (Business Logic & Security)   │
         │  ├─ Auth Service               │
         │  ├─ Organization Service       │
         │  ├─ Team Service               │
         │  ├─ Patient Service            │
         │  ├─ Billing Service            │
         │  ├─ Audit Service              │
         │  └─ Permission Service         │
         └────────────┬─────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
    ┌──────────────┐        ┌───────────────┐
    │ Firestore    │        │ PostgreSQL    │
    │ (org data)   │        │ (relational)  │
    └──────────────┘        └───────────────┘
         │                         │
    ┌────┴─────────────────────────┤
    ▼                              ▼
  Firebase            ┌─────────────────────┐
  ├─ Auth              │ Supporting Services │
  ├─ Storage           ├─ Stripe (Billing)  │
  ├─ Backup            ├─ Sentry (Errors)   │
  └─ Real-time Sync    ├─ LogRocket (Logs)  │
                       └─────────────────────┘

Features:
✅ Multiple organizations
✅ Team collaboration
✅ Subscription tiers
✅ Role-based access
✅ Audit logging
✅ Payment processing
```

---

## Data Model Transformation

### **Phase 1: Current Model**

```typescript
Firestore Collections:
├─ patients/
│  ├─ {userId}/patientId
│  │  ├─ userId: "abc123"
│  │  ├─ name: "John Doe"
│  │  └─ phone: "555-1234"
│
└─ visits/
   ├─ {userId}/visitId
      ├─ userId: "abc123"
      ├─ patientId: "pat-001"
      └─ date: "2024-02-26"

Authentication:
├─ Firebase Auth (user)
└─ allowedUsers/ collection (simple allowlist)
```

**Problem:** Only single user per patient

---

### **Phase 2: Multi-Tenant Model (SaaS Version)**

```typescript
Firestore Collections:

1. ORGANIZATIONS (NEW)
organizations/
├─ {orgId}/
│  ├─ id: "org-clinic-001"
│  ├─ name: "Green Valley Clinic"
│  ├─ tier: "professional"
│  ├─ owner: "doc-001"
│  ├─ customization: { color, logo, name }
│  └─ billing: { status, stripeId }

2. USERS (UPDATED)
users/
├─ {userId}/
│  ├─ id: "user-123"
│  ├─ email: "doctor@clinic.com"
│  ├─ organizationId: "org-clinic-001"      ← NEW
│  ├─ organizationRole: "doctor"            ← NEW
│  ├─ permissions: ["read:patients", ...]   ← NEW
│  ├─ name: "Dr. Smith"
│  └─ status: "active"

3. ORGANIZATION ROLES (NEW)
organizations/{orgId}/roles/
├─ {roleId}/
│  ├─ name: "Doctor"
│  ├─ permissions: [
│      "read:patients",
│      "write:visits",
│      "read:dashboard"
│    ]
│  └─ builtin: false

4. TEAM MEMBERS (NEW)
organizations/{orgId}/members/
├─ {memberId}/
│  ├─ userId: "user-123"
│  ├─ role: "doctor"
│  ├─ joinedAt: Timestamp
│  └─ status: "active"

5. INVITATIONS (NEW)
organizations/{orgId}/invitations/
├─ {inviteId}/
│  ├─ email: "newdoctor@clinic.com"
│  ├─ role: "staff"
│  ├─ token: "abc123def456"
│  ├─ expiresAt: Timestamp
│  └─ status: "pending"

6. PATIENTS (SCOPED)
organizations/{orgId}/patients/    ← NOW SCOPED BY ORG
├─ {patientId}/
│  ├─ id: "pat-001"
│  ├─ organizationId: "org-clinic-001"
│  ├─ name: "John Doe"
│  ├─ phone: "555-1234"
│  └─ createdBy: "user-123"

7. VISITS (SCOPED)
organizations/{orgId}/visits/      ← NOW SCOPED BY ORG
├─ {visitId}/
│  ├─ id: "visit-001"
│  ├─ organizationId: "org-clinic-001"
│  ├─ patientId: "pat-001"
│  ├─ date: Timestamp
│  └─ recordedBy: "user-123"

8. AUDIT LOGS (NEW)
organizations/{orgId}/audit_logs/
├─ {logId}/
│  ├─ action: "patient_created"
│  ├─ actor: "user-123"
│  ├─ resource: "patients/pat-001"
│  ├─ timestamp: Timestamp
│  └─ details: { ... }

9. SUBSCRIPTIONS (NEW)
organizations/{orgId}/subscription/
├─ stripeCustomerId: "cus_xxx"
├─ stripePlanId: "price_xxx"
├─ tier: "professional"
├─ status: "active"
├─ currentPeriodStart: Timestamp
├─ currentPeriodEnd: Timestamp
└─ autoRenew: true

10. USAGE METRICS (NEW)
organizations/{orgId}/usage/
├─ {month}/ (e.g., "2024-02")
│  ├─ patients_created: 45
│  ├─ visits_created: 120
│  ├─ storage_bytes: 5242880
│  └─ api_calls: 2500
```

---

## Security Rules Transformation

### **Current: Basic User-Level Security**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /patients/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /visits/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Problem:** Any authenticated user can access any patient/visit

---

### **Target: Organization-Scoped Security (SaaS)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function getUserOrg() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.organizationId;
    }
    
    function hasPermission(permission) {
      let userDoc = get(/databases/$(database)/documents/users/$(request.auth.uid));
      let permissions = userDoc.data.permissions;
      return permission in permissions || 'admin' in userDoc.data.roles;
    }
    
    // Organizations - only org admin/owner
    match /organizations/{orgId} {
      allow read: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.organizationId == orgId;
      allow write: if request.auth != null && 
                      request.auth.uid == resource.data.owner;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null && 
                     (request.auth.uid == userId || 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.organizationId == 
                      resource.data.organizationId);
      allow write: if request.auth.uid == userId;
    }
    
    // Patients - org-scoped + permission-based
    match /organizations/{orgId}/patients/{patientId} {
      allow read: if request.auth != null && 
                     getUserOrg() == orgId && 
                     hasPermission('read:patients');
      allow create: if request.auth != null && 
                       getUserOrg() == orgId && 
                       hasPermission('write:patients');
      allow update: if request.auth != null && 
                       getUserOrg() == orgId && 
                       hasPermission('write:patients') &&
                       request.resource.data.organizationId == orgId;  // Prevent org change
      allow delete: if request.auth != null && 
                       getUserOrg() == orgId && 
                       hasPermission('delete:patients');
    }
    
    // Visits - org-scoped + immutable audit trail
    match /organizations/{orgId}/visits/{visitId} {
      allow read: if request.auth != null && getUserOrg() == orgId;
      allow create: if request.auth != null && 
                       getUserOrg() == orgId && 
                       hasPermission('write:visits') &&
                       request.resource.data.organizationId == orgId;
      allow update: if request.auth != null && 
                       getUserOrg() == orgId && 
                       hasPermission('write:visits') &&
                       resource.data.organizationId == getUserOrg();
      allow delete: if false;  // Immutable for audit
    }
    
    // Audit logs - append-only
    match /organizations/{orgId}/audit_logs/{logId} {
      allow read: if request.auth != null && getUserOrg() == orgId;
      allow create: if request.auth != null && getUserOrg() == orgId;
      allow update, delete: if false;  // Immutable
    }
  }
}
```

---

## Component Changes Required

### **Before: HomeComponent (Current)**

```typescript
export class HomeComponent implements OnInit {
  patients: Patient[] = [];
  
  constructor(
    private patientService: PatientService,
    private authService: AuthenticationService,
  ) {}
  
  ngOnInit() {
    this.patientService.getPatients().subscribe(patients => {
      this.patients = patients;
    });
  }
}
```

**Problem:** Direct patient access, no org/permission checking

---

### **After: HomeComponent (SaaS Version)**

```typescript
export class HomeComponent implements OnInit {
  patients: Patient[] = [];
  currentOrg$: Observable<Organization>;
  permissions$: Observable<string[]>;
  canCreatePatient: boolean;
  
  constructor(
    private patientService: PatientService,
    private authService: AuthenticationService,
    private orgService: OrganizationService,     // NEW
    private permissionService: PermissionService, // NEW
  ) {
    this.currentOrg$ = this.orgService.getCurrentOrganization();
    this.permissions$ = this.permissionService.getUserPermissions();
  }
  
  ngOnInit() {
    // 1. Get current organization
    const orgId = this.orgService.getCurrentOrgId();
    
    // 2. Check permission before loading
    this.permissionService.canRead('patients').subscribe(allowed => {
      if (!allowed) {
        this.router.navigate(['/unauthorized']);
        return;
      }
      
      // 3. Load patients for current org only
      this.patientService.getPatientsInOrg(orgId).subscribe(patients => {
        this.patients = patients;
      });
    });
    
    // 4. Check if user can create patients (for UI visibility)
    this.permissionService.canWrite('patients').subscribe(allowed => {
      this.canCreatePatient = allowed;
    });
  }
  
  // Template now includes org context
  get pageTitle(): string {
    return `${this.currentOrg$.value.name} - Patients`;
  }
}
```

**Usage in template:**
```html
<div class="header">
  <h1>{{ (currentOrg$ | async)?.name }}</h1>
  <button *ngIf="canCreatePatient" (click)="openAddPatientModal()">
    Add Patient
  </button>
</div>

<div class="patient-list">
  <div *ngFor="let patient of patients" class="patient-row">
    <p>{{ patient.name }}</p>
    <!-- Only show edit/delete if user has permissions -->
    <button *ngIf="permissions$ | async as perms; if: perms.includes('write:patients')">Edit</button>
  </div>
</div>
```

---

## Service Changes Required

### **New: Organization Service**

```typescript
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private currentOrg$ = new BehaviorSubject<Organization | null>(null);
  
  constructor(
    private auth: AuthenticationService,
    private firestore: Firestore
  ) {
    // Load user'sorg on auth state change
    this.auth.currentUser$.subscribe(user => {
      if (user) this.loadUserOrganization(user.uid);
    });
  }
  
  private async loadUserOrganization(userId: string) {
    const userDoc = await getDoc(doc(this.firestore, 'users', userId));
    const orgId = userDoc.data()?.organizationId;
    const orgDoc = await getDoc(doc(this.firestore, 'organizations', orgId));
    this.currentOrg$.next(orgDoc.data() as Organization);
  }
  
  getCurrentOrganization(): Observable<Organization | null> {
    return this.currentOrg$.asObservable();
  }
  
  getCurrentOrgId(): string | null {
    return this.currentOrg$.value?.id ?? null;
  }
  
  async createOrganization(org: Organization): Promise<string> {
    const docRef = await addDoc(collection(this.firestore, 'organizations'), org);
    return docRef.id;
  }
  
  async addTeamMember(orgId: string, email: string, role: string): Promise<void> {
    // Create invitation
    // Send email with invite link
    // Handle accept flow
  }
}
```

---

### **New: Permission Service**

```typescript
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private permissions$ = new BehaviorSubject<string[]>([]);
  
  constructor(
    private auth: AuthenticationService,
    private firestore: Firestore
  ) {
    this.auth.currentUser$.subscribe(user => {
      if (user) this.loadUserPermissions(user.uid);
    });
  }
  
  private async loadUserPermissions(userId: string) {
    const userDoc = await getDoc(doc(this.firestore, 'users', userId));
    const permissions = userDoc.data()?.permissions ?? [];
    this.permissions$.next(permissions);
  }
  
  canRead(resource: string): Observable<boolean> {
    return this.permissions$.pipe(
      map(perms => perms.includes(`read:${resource}`))
    );
  }
  
  canWrite(resource: string): Observable<boolean> {
    return this.permissions$.pipe(
      map(perms => perms.includes(`write:${resource}`))
    );
  }
  
  canDelete(resource: string): Observable<boolean> {
    return this.permissions$.pipe(
      map(perms => perms.includes(`delete:${resource}`))
    );
  }
}
```

---

### **Updated: PatientService**

```typescript
@Injectable({ providedIn: 'root' })
export class PatientService {
  constructor(
    private firestore: Firestore,
    private auth: AuthenticationService,
    private orgService: OrganizationService
  ) {}
  
  // Current: Direct access
  // getPatients(): Observable<Patient[]> { }
  
  // NEW: Organization-scoped
  getPatientsInOrg(orgId: string): Observable<Patient[]> {
    return collectionData(
      query(
        collection(this.firestore, `organizations/${orgId}/patients`),
        where('organizationId', '==', orgId),
        orderBy('createdAt', 'desc')
      )
    ) as Observable<Patient[]>;
  }
  
  async createPatient(orgId: string, patientData: Partial<Patient>): Promise<string> {
    // Server-side validation would happen here in real API
    const docRef = await addDoc(
      collection(this.firestore, `organizations/${orgId}/patients`),
      {
        ...patientData,
        organizationId: orgId,
        createdAt: new Date(),
        createdBy: this.auth.getCurrentUser()?.uid,
      }
    );
    
    // Log audit event
    await this.logAuditAction(orgId, 'patient_created', docRef.id);
    
    return docRef.id;
  }
  
  private async logAuditAction(orgId: string, action: string, resourceId: string) {
    await addDoc(
      collection(this.firestore, `organizations/${orgId}/audit_logs`),
      {
        action,
        resource: resourceId,
        actor: this.auth.getCurrentUser()?.uid,
        timestamp: new Date(),
      }
    );
  }
}
```

---

## Quick Start: First Week Implementation

```
Week 1 Checklist (Priority: HIGH)

DAY 1-2: Organization Model
  ✅ Create Organization interface
  ✅ Create organizations/ collection structure
  ✅ Add organizationId to User model
  ✅ Update security rules for org-scoping

DAY 3-4: Update Components to Use Organizations
  ✅ Create OrganizationService
  ✅ Update HomeComponent to use orgId
  ✅ Update PatientService to query by org
  ✅ Update firestore queries

DAY 5: UI Improvements
  ✅ Show current organization in header
  ✅ Add tenant switcher (if multiple orgs)
  ✅ Update breadcrumbs

Expected Result After Week 1:
  ✅ Single organization works end-to-end
  ✅ All data scoped to organization
  ✅ Ready to add team members in Week 2
```

---

## Database Migration Script (Optional)

For migrating existing single-tenant data to SaaS model:

```typescript
// Firestore batch migration
const migrate = async () => {
  const batch = writeBatch(db);
  
  // 1. Create organization for existing user
  const orgRef = doc(collection(db, 'organizations'));
  batch.set(orgRef, {
    id: orgRef.id,
    name: 'My Clinic',
    owner: 'existing-user-id',
    tier: 'starter',
    created At: new Date(),
  });
  
  // 2. Create organization-scoped patient collection
  const patients = await getDocs(collection(db, 'patients'));
  patients.forEach(patientDoc => {
    const newPath = `organizations/${orgRef.id}/patients/${patientDoc.id}`;
    batch.set(doc(db, newPath), {
      ...patientDoc.data(),
      organizationId: orgRef.id,
    });
  });
  
  // 3. Update user with organization ID
  const userRef = doc(db, 'users', 'existing-user-id');
  batch.update(userRef, {
    organizationId: orgRef.id,
    organizationRole: 'owner',
  });
  
  await batch.commit();
  console.log('✅ Migration complete');
};
```

---

## Success: Month 1 Milestone

✅ **Multi-organization support live**
✅ **Team members can invite colleagues**
✅ **Role-based access working**
✅ **Audit logs being recorded**
✅ **Data properly isolated by org**
✅ **Ready for billing integration**

👉 **Next: Stripe payment setup (Week 5-7)**
