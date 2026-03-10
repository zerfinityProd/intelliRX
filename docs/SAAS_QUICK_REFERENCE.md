# SaaS vs. Current Architecture - Quick Reference Guide

**Use this chart to understand what changes between current and SaaS versions**

---

## 🔄 Core Concepts Shift

| Aspect | Current (Single-Tenant) | SaaS (Multi-Tenant) | Change |
|--------|------------------------|-------------------|--------|
| **Organization Scope** | Single user | Multiple organizations | Users belong to ONE org (start) |
| **Authentication** | Email/Google only | Email/Google + Workspace | Same auth, different context |
| **Data Access** | User-level | Organization-level | ALL queries filtered by orgId |
| **Permissions** | Admin vs User | Roles + Granular permissions | Permission guards on routes |
| **Team** | Single user (implicit) | Multi-user with roles | Team invitations + management |
| **Billing** | None | Per-organization subscription | Stripe integration |
| **Compliance** | Basic | HIPAA-ready | Security rules + audit logs |

---

## 📂 File Structure Changes

### Files That Will CHANGE
```
src/app/
├── models/
│   ├── patient.model.ts              ← Add organizationId to all interfaces
│   ├── user.ts                       ← Add organizationId, role, permissions
│   └── **organization.model.ts**     ← NEW
│
├── services/
│   ├── authenticationService.ts      ← Update to load org context
│   ├── patient.ts                    ← Add orgId to all queries
│   ├── firebase.ts                   ← Add org-scoping to Firestore rules review
│   ├── **organization.service.ts**   ← NEW
│   ├── **permission.service.ts**     ← NEW
│   ├── **team.service.ts**           ← NEW
│   ├── **audit.service.ts**          ← NEW
│   └── **usage.service.ts**          ← NEW
│
├── guards/
│   ├── auth-guard.ts                 ← Works as-is
│   └── **role.guard.ts**             ← NEW
│
├── components/
│   ├── home/
│   │   ├── home.ts                   ← Add org & permission context
│   │   ├── home.html                 ← Add org display + permission checks
│   │   └── home.spec.ts              ← Update tests
│   │
│   ├── patient-details/
│   │   ├── patient-details.ts        ← Add org & permission context
│   │   ├── patient-details.html      ← Update permission checks
│   │   └── patient-details.spec.ts   ← Update tests
│   │
│   ├── add-patient/
│   │   ├── add-patient.ts            ← Add org context
│   │   └── add-patient.spec.ts       ← Update tests
│   │
│   ├── **team-management/**          ← NEW COMPONENT
│   │   ├── team-management.ts
│   │   ├── team-management.html
│   │   ├── team-management.css
│   │   └── team-management.spec.ts
│   │
│   └── **team-invite-modal/**        ← NEW COMPONENT
│       ├── team-invite-modal.ts
│       └── team-invite-modal.spec.ts
│
└── app.routes.ts                     ← Add new routes + guards
```

---

## 🔀 Service Method Changes

### Example: PatientService

**BEFORE (Current)**
```typescript
// src/app/services/patient.ts

getPatients(): Observable<Patient[]> {
  return collectionData(
    query(
      collection(this.db, 'patients'),
      where('userId', '==', this.auth.uid)  // ← Single user only
    )
  ) as Observable<Patient[]>;
}

async addPatient(data: Partial<Patient>): Promise<string> {
  const doc = await addDoc(collection(this.db, 'patients'), {
    ...data,
    userId: this.auth.uid
  });
  return doc.id;
}
```

**AFTER (SaaS)**
```typescript
// src/app/services/patient.ts

constructor(
  private db: Firestore,
  private auth: AuthenticationService,
  private org: OrganizationService,        // ← NEW
  private permission: PermissionService    // ← NEW
) {}

getPatientsInOrg(orgId: string): Observable<Patient[]> {
  return collectionData(
    query(
      collection(this.db, `organizations/${orgId}/patients`),  // ← ORG SCOPED
      where('organizationId', '==', orgId)
    )
  ) as Observable<Patient[]>;
}

async addPatient(orgId: string, data: Partial<Patient>): Promise<string> {
  // Check permission first
  const canWrite = await this.permission.canWrite('patients').toPromise();
  if (!canWrite) throw new Error('Permission denied');
  
  const doc = await addDoc(
    collection(this.db, `organizations/${orgId}/patients`),
    {
      ...data,
      organizationId: orgId,      // ← ORG CONTEXT
      createdBy: this.auth.uid    // ← AUDIT
    }
  );
  
  // Log audit event
  await this.audit.log(orgId, 'patient_created', doc.id);
  
  return doc.id;
}
```

---

## 🔐 Firestore Security Rules Changes

### BEFORE (Current)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /patients/{document=**} {
      allow read, write: if request.auth != null;  // ← ANY LOGGED IN USER
    }
  }
}
```

### AFTER (SaaS)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function getUserOrg() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid))
        .data.organizationId;
    }
    
    function hasPermission(perm) {
      let user = get(/databases/$(database)/documents/users/$(request.auth.uid));
      return perm in user.data.permissions;
    }
    
    // Organization-scoped patients - ONLY same org
    match /organizations/{orgId}/patients/{patientId} {
      allow read: if request.auth != null && 
                     getUserOrg() == orgId &&  // ← ORG CHECK
                     hasPermission('read:patients');  // ← PERMISSION CHECK
      
      allow create: if request.auth != null && 
                       getUserOrg() == orgId &&
                       hasPermission('write:patients') &&
                       request.resource.data.organizationId == orgId;  // ← IMMUTABLE ORG
      
      allow delete: if false;  // ← SOFT DELETE ONLY
    }
  }
}
```

---

## 🎯 Component Logic Changes

### BEFORE: HomeComponent ngOnInit()
```typescript
ngOnInit() {
  this.patientService.getPatients().subscribe(patients => {
    this.patients = patients;
  });
}
```

### AFTER: HomeComponent ngOnInit()
```typescript
ngOnInit() {
  // 1. Get current org
  const orgId = this.org.getCurrentOrgId();
  if (!orgId) {
    this.router.navigate(['/organizations']);
    return;
  }
  
  // 2. Check permission
  this.permission.canRead('patients').subscribe(allowed => {
    if (!allowed) {
      this.errorMessage = 'You do not have permission to view patients';
      return;
    }
    
    // 3. Load patients for this org
    this.patientService.getPatientsInOrg(orgId).subscribe(patients => {
      this.patients = patients;
    });
  });
}
```

### BEFORE: HomeComponent Template
```html
<button (click)="openAddPatientModal()">Add Patient</button>

<div *ngFor="let patient of patients">
  <span>{{ patient.name }}</span>
  <button (click)="editPatient(patient)">Edit</button>
</div>
```

### AFTER: HomeComponent Template
```html
<!-- Show org context -->
<div class="org-header">
  <h2>{{ (currentOrg$ | async)?.name }}</h2>
  <span class="member-badge">{{ teamMembersCount }} members</span>
</div>

<!-- Only show add button if permission allows -->
<button (click)="openAddPatientModal()" 
        *ngIf="canWrite$ | async">
  Add Patient
</button>

<div *ngFor="let patient of patients">
  <span>{{ patient.name }}</span>
  <!-- Edit only visible if permission allows -->
  <button (click)="editPatient(patient)"
          *ngIf="canWrite$ | async">
    Edit
  </button>
</div>
```

---

## 🗄️ Firestore Collection Structure

### BEFORE
```
patients/
├─ abc123/                    ← UserId
│  ├─ patient-001
│  │  ├─ name: "John"
│  │  └─ userId: "abc123"
│  └─ patient-002
│
visits/
└─ abc123/                    ← UserId
    ├─ visit-001
    └─ visit-002

allowedUsers/                 ← Simple allowlist (authorization)
├─ john@clinic.com
└─ doctor@clinic.com
```

### AFTER
```
organizations/
├─ org-clinic-001
│  ├─ name: "Valley Clinic"
│  ├─ tier: "professional"
│  ├─ owner: "user-123"
│  └─ members/
│      ├─ user-123: {role: "admin"}
│      ├─ user-456: {role: "doctor"}
│      └─ user-789: {role: "staff"}
│
users/
├─ user-123
│  ├─ email: "admin@clinic.com"
│  ├─ organizationId: "org-clinic-001"     ← NEW
│  ├─ organizationRole: "admin"             ← NEW
│  └─ permissions: ["read:patients", ...]   ← NEW
│
└─ user-456
   ├─ email: "doctor@clinic.com"
   ├─ organizationId: "org-clinic-001"
   ├─ organizationRole: "doctor"
   └─ permissions: ["read:patients", "write:visits", ...]

patients/
└─ org-clinic-001/            ← ORG-SCOPED (NEW)
   ├─ patient-001
   │  ├─ organizationId: "org-clinic-001"
   │  ├─ name: "John"
   │  └─ createdBy: "user-456"
   └─ patient-002

visits/
└─ org-clinic-001/            ← ORG-SCOPED (NEW)
    ├─ visit-001
    │  └─ organizationId: "org-clinic-001"
    └─ visit-002

audit_logs/
└─ org-clinic-001/            ← AUDIT TRAIL (NEW)
    ├─ log-001: {action: "patient_created", actor: "user-456", ...}
    └─ log-002: {action: "visit_created", actor: "user-456", ...}

subscriptions/
└─ org-clinic-001/            ← BILLING (NEW)
    ├─ plan: "professional"
    ├─ status: "active"
    └─ stripe_subscription_id: "sub_xxx"
```

---

## 🧪 Testing Changes

### BEFORE: PatientService Test
```typescript
it('gets patients', (done) => {
  service.getPatients().subscribe(patients => {
    expect(patients.length).toBeGreaterThan(0);
    done();
  });
});
```

### AFTER: PatientService Test
```typescript
it('gets patients for specific org', (done) => {
  const orgId = 'org-test-001';
  service.getPatientsInOrg(orgId).subscribe(patients => {
    // Ensure all patients belong to this org
    patients.forEach(p => {
      expect(p.organizationId).toBe(orgId);
    });
    done();
  });
});

it('rejects access to other orgs patients', (done) => {
  const wrongOrgId = 'org-other-001';
  service.getPatientsInOrg(wrongOrgId).subscribe(
    () => {
      fail('Should not have access');
    },
    (error) => {
      expect(error).toContain('Permission denied');
      done();
    }
  );
});
```

---

## ⚡ Performance Considerations

| Change | Impact | Mitigation |
|--------|--------|-----------|
| Deeper collection paths (`organizations/{orgId}/patients`) | +5-10% query time | Indexing, caching |
| Permission checks on every read | +10-20ms per request | Cache permissions in local state |
| Audit logging on mutations | +20ms per write | Batch writes, Cloud Functions |
| Team member invitations | New feature | Use queue (Firestore Task Queue) |

---

## 🚨 Breaking Changes for Existing Users

If migrating existing data:

```
BEFORE LOGIN AFTER UPGRADE:
❌ User will see: "No organization found"
✅ Solution: Run migration script to create org + assign user

BEFORE: Patient accessed at /patients/{userId}/{patientId}
❌ After: Patient at /organizations/{orgId}/patients/{patientId}
✅ Solution: Firestore rules block old path, migrate data

BEFORE: Direct firestore.collection('patients').where('userId', ...)
❌ After: Must use PatientsService.getPatientsInOrg(orgId)
✅ Solution: Update all components, deprecate direct Firestore access
```

---

## 🎯 Decision Tree for Implementation

```
Starting feature development?
│
├─ Modifying search/query?
│  └─ Add orgId parameter → Filter by organizationId
│
├─ Creating/updating record?
│  └─ Check permission first → Log to audit_logs
│
├─ Building UI component?
│  └─ Add org context → Show permission-based UI
│
├─ Writing test?
│  └─ Use orgId fixtures → Test org isolation
│
└─ Updating security rules?
   └─ Add org check → Add permission check
```

---

## 💾 Data Migration Plan (If Needed)

```typescript
// Migration script to run ONE TIME before launch
async function migrateToSaaS() {
  const batch = writeBatch(db);
  const existingUsers = await getDocs(collection(db, 'users'));
  
  existingUsers.forEach(userDoc => {
    // 1. Create organization for this user
    const orgRef = doc(collection(db, 'organizations'));
    batch.set(orgRef, {
      name: `${userDoc.data().name}'s Clinic`,
      owner: userDoc.id,
      tier: 'starter',
      createdAt: new Date(),
    });
    
    // 2. Update user with organization
    batch.update(userDoc.ref, {
      organizationId: orgRef.id,
      organizationRole: 'owner',
      permissions: ['read:*', 'write:*'],
    });
    
    // 3. Migrate users existing patients to new collection
    // (handled separately due to volume)
  });
  
  await batch.commit();
}
```

---

## ✅ Quality Checklist Before Merging Code

Before merging ANY pull request, verify:
- [ ] All queries include `organizationId` filter
- [ ] No direct Firestore access outside services
- [ ] Permission check before sensitive operations
- [ ] Audit log entry for data mutations
- [ ] Tests include org isolation scenarios
- [ ] Firestore rules reviewed for new paths
- [ ] Component tests mock org context
- [ ] No hard-coded organization IDs

---

**Print this page and post it on your team wall for quick reference! 📌**
