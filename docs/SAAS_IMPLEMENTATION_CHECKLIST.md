# SaaS Implementation Checklist & Quick Reference

**Version:** 1.0  
**Last Updated:** February 26, 2026  
**Use This For:** Day-to-day project tracking during SaaS conversion

---

## 📋 Phase 1: Multi-Tenancy Foundation (Weeks 1-4)

### Week 1: Data Model & Schema

**Task 1.1: Design Organization Model**
- [ ] Create `Organization` interface in `src/models/organization.model.ts`
  ```typescript
  export interface Organization {
    id: string;
    name: string;
    owner: string;  // userId
    tier: 'starter' | 'professional' | 'enterprise';
    customization?: { color?: string; logo?: string };
    billingEmail: string;
    status: 'active' | 'suspended' | 'trial';
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- [ ] Document all required fields
- [ ] Share with team for feedback

**Task 1.2: Design Role-Based Model**
- [ ] Create `Role` interface
- [ ] Define default roles: Admin, Doctor, Staff, Viewer
- [ ] Define default permissions per role
- [ ] Document permission naming convention (e.g., `read:patients`)

**Task 1.3: Update User Model**
- [ ] Add `organizationId: string` field
- [ ] Add `organizationRole: string` field  
- [ ] Add `permissions: string[]` field
- [ ] Update `authenticationService.ts` to populate these fields

**Task 1.4: Design Firestore Collections**
- [ ] Sketch out new collection structure (see guide)
- [ ] Document collection access patterns
- [ ] Plan for future scaling (sharding strategy)
- [ ] Share schema diagram with team

---

### Week 2: Create Services & Security Rules

**Task 2.1: Create OrganizationService**
- [ ] New file: `src/app/services/organization.service.ts`
- [ ] Implement methods:
  - `createOrganization(org: Organization): Promise<string>`
  - `getCurrentOrganization(): Observable<Organization>`
  - `getCurrentOrgId(): string`
  - `updateOrganization(id: string, updates: Partial<Organization>): Promise<void>`
  - `deleteOrganization(id: string): Promise<void>` (admin only)

**Task 2.2: Create PermissionService**
- [ ] New file: `src/app/services/permission.service.ts`
- [ ] Implement methods:
  - `canRead(resource: string): Observable<boolean>`
  - `canWrite(resource: string): Observable<boolean>`
  - `canDelete(resource: string): Observable<boolean>`
  - `hasRole(role: string): Observable<boolean>`
  - `loadPermissions(userId: string): Promise<string[]>`

**Task 2.3: Create AuditService (NEW)**
- [ ] New file: `src/app/services/audit.service.ts`
- [ ] Implement methods:
  - `log(orgId: string, action: string, resource: string): Promise<void>`
  - `getAuditLog(orgId: string): Observable<AuditLog[]>`
  - `exportAuditLog(orgId: string, format: 'json'|'csv'): Promise<Blob>`

**Task 2.4: Update Firestore Security Rules**
- [ ] Update `firestore.rules`:
  - Add helper functions for org verification
  - Scope all collections to organization
  - Implement permission-based access
  - Make audit logs append-only
  - Test rules with emulator
- [ ] Deploy rules to Firebase

**Task 2.5: Create Role Guard**
- [ ] New file: `src/app/guards/role.guard.ts`
- [ ] Implement `CanActivateFn` for route protection
- [ ] Test guard with home route

---

### Week 3: Update Core Services

**Task 3.1: Update PatientService**
- [ ] Add `organizationId` parameter to all methods
- [ ] Update `getPatients()` → `getPatientsInOrg(orgId)`
- [ ] Update query to scope by `organizations/{orgId}/patients`
- [ ] Add `createPatient(orgId, data)` with org validation
- [ ] Update `updatePatient()` with permission checks
- [ ] Add audit logging to all mutations
- [ ] Tests: Update 10+ tests to use orgId

**Task 3.2: Update VisitService**
- [ ] Same changes as PatientService
- [ ] Scope to `organizations/{orgId}/visits`

**Task 3.3: Update AuthenticationService**
- [ ] Load organization data on login
- [ ] Set `organizationId` in currentUser$
- [ ] Initialize permissions on auth state change
- [ ] Handle org context in logout

**Task 3.4: Add Team Management Methods**
- [ ] New file: `src/app/services/team.service.ts`
- [ ] Implement:
  - `inviteTeamMember(orgId, email, role): Promise<void>`
  - `listTeamMembers(orgId): Observable<TeamMember[]>`
  - `removeTeamMember(orgId, userId): Promise<void>`
  - `updateTeamMemberRole(orgId, userId, newRole): Promise<void>`

**Task 3.5: Add Usage Tracking (for billing later)**
- [ ] New file: `src/app/services/usage.service.ts`
- [ ] Implement:
  - `trackPatientCreation(orgId): Promise<void>`
  - `trackVisitCreation(orgId): Promise<void>`
  - `getMonthlyUsage(orgId, month): Promise<UsageMetrics>`

---

### Week 4: Update Components & Integration Tests

**Task 4.1: Update HomeComponent**
- [ ] Import `OrganizationService`, `PermissionService`
- [ ] Get current org in `ngOnInit()`
- [ ] Pass `orgId` to `patientService.getPatientsInOrg(orgId)`
- [ ] Show current org name in header
- [ ] Hide buttons based on permissions
- [ ] Add permission checks before showing modals
- [ ] Update tests × 5

**Task 4.2: Update PatientDetailsComponent**
- [ ] Same changes as HomeComponent
- [ ] Update visit loading to use org scope
- [ ] Add permission checks for create/edit/delete
- [ ] Update tests × 3

**Task 4.3: Update AddPatientComponent**
- [ ] Get `orgId` from `OrganizationService`
- [ ] Pass `orgId` to service methods
- [ ] Add permission check before allowing submit
- [ ] Update tests × 2

**Task 4.4: Create OrganizationContextComponent (NEW)**
- [ ] Display current organization
- [ ] Show team member count
- [ ] Quick access to team settings
- [ ] Add to app shell

**Task 4.5: Integration Tests**
- [ ] Test multi-org data isolation
- [ ] Test permission enforcement
- [ ] Test team member access
- [ ] Run full test suite → target: 100% pass rate

---

## 📋 Phase 2: Team Management UI (Weeks 5-6)

### Week 5: Team Invite System

**Task 5.1: Create Team Invite Modal Component**
- [ ] New component: `team-invite-modal.component.ts`
- [ ] Form with: email, role dropdown
- [ ] Call `TeamService.inviteTeamMember()`
- [ ] Show success/error messages
- [ ] Unit tests

**Task 5.2: Create Team Members List Component**
- [ ] New component: `team-members-list.component.ts`
- [ ] Display all team members
- [ ] Show role badge
- [ ] "Remove member" button (admin only)
- [ ] "Change role" dropdown (admin only)
- [ ] Unit tests

**Task 5.3: Implement Invite Email System**
- [ ] Use Firebase Cloud Functions or SendGrid
- [ ] Email template with invite link
- [ ] Token-based invite acceptance
- [ ] 7-day expiration

**Task 5.4: Create Invite Acceptance Flow**
- [ ] New page: `/invite/:token`
- [ ] Verify token validity
- [ ] Auto-login + redirect to org

---

### Week 6: Team Management Settings Page

**Task 6.1: Create Team Management Page**
- [ ] New component: `team-management.component.ts`
- [ ] Display team members list
- [ ] "Invite team member" button
- [ ] "Edit roles" functionality
- [ ] "Remove member" confirmation

**Task 6.2: Add to Navigation**
- [ ] Add "Team Settings" to sidebar
- [ ] Route: `/organization/team`
- [ ] Guard with role check (admin only)

**Task 6.3: Add Org Switcher (if multi-org support)**
- [ ] User profile menu → "Switch organization"
- [ ] Show list of organizations user is member of
- [ ] Update localStorage with current org

**Task 6.4: Testing**
- [ ] Integration tests × 5
- [ ] E2E scenarios for invite flow

---

## 📋 Phase 3: Role-Based Access Control (Weeks 7-8)

### Week 7: Permission System

**Task 7.1: Define Permission Matrix**
| Resource | Viewer | Staff | Doctor | Admin |
|----------|--------|-------|--------|-------|
| read:patients | ✓ | ✓ | ✓ | ✓ |
| write:patients | ✗ | ✗ | ✓ | ✓ |
| read:visits | ✓ | ✓ | ✓ | ✓ |
| write:visits | ✗ | ✓ | ✓ | ✓ |
| delete:visits | ✗ | ✗ | ✗ | ✓ |
| read:team | ✗ | ✗ | ✗ | ✓ |
| write:team | ✗ | ✗ | ✗ | ✓ |
| read:audit_log | ✗ | ✗ | ✗ | ✓ |

- [ ] Document all permissions
- [ ] Share for approval

**Task 7.2: Implement Permission Guards**
- [ ] Create `CanActivateFn` for individual permissions
- [ ] Example: `canEdit('/patients/:id'): CanActivateFn`
- [ ] Test guards in isolation

**Task 7.3: Update Component Visibility**
- [ ] HomeComponent: Hide add/edit/delete based on `canWrite:patients`
- [ ] PatientDetailsComponent: Hide edit visit button based on permissions
- [ ] AddVisitComponent: Show permission error if no access
- [ ] All modals: Check permission before opening

**Task 7.4: Backend Permission Checks**
- [ ] Update Cloud Functions to check permissions
- [ ] Example: `createPatient()` verifies `write:patients`
- [ ] Return 403 Forbidden if no permission

---

### Week 8: Custom Roles (Optional for MVP)

**Task 8.1: Custom Role Management (If time permits)**
- [ ] Admin can create custom roles
- [ ] Assign permissions to custom role
- [ ] Assign users to custom role
- [ ] UI in team management page

**Task 8.2: Testing**
- [ ] Permission matrix test cases × 20+
- [ ] Guard test cases × 10+

---

## 🏗️ Phase 4: Security Hardening

### **Pre-Launch Security Checklist**

**Authentication & Authorization**
- [ ] Validate all user inputs (prevent injection)
- [ ] Hash passwords using Firebase (done by Firebase Auth)
- [ ] Implement 2FA (optional for MVP, priority for Year 2)
- [ ] Rate limit login attempts (Firebase handles via Auth)
- [ ] Session timeout (30 min inactivity)

**Data Security**
- [ ] Firestore rules deny-all-by-default ✅
- [ ] All collections org-scoped ✅
- [ ] Immutable audit logs ✅
- [ ] Encrypt sensitive fields (PII)
- [ ] Data retention policy documented

**API Security** (if using backend)
- [ ] HTTPS/TLS enforced ✅ (Firebase)
- [ ] CORS properly configured
- [ ] Rate limiting (100 req/min per user)
- [ ] Request signing/validation
- [ ] API versioning strategy

**Infrastructure Security**
- [ ] Firebase backup strategy
- [ ] Disaster recovery plan
- [ ] Penetration testing scheduled
- [ ] Monitoring alerts for suspicious activity

**Compliance (Healthcare)**
- [ ] HIPAA Business Associate Agreement signed
- [ ] BAA covers all vendors (Stripe, Sentry, etc.)
- [ ] Data processing agreement in customer contract
- [ ] Breach notification procedure documented
- [ ] Privacy policy addressing HIPAA

---

## 🧪 Testing Checklist

**Unit Tests**
- [ ] OrganizationService: 10+ tests
- [ ] PermissionService: 15+ tests
- [ ] All updated services: 50+ new tests
- [ ] Target: >85% coverage

**Integration Tests**
- [ ] Multi-org data isolation: 5 tests
- [ ] Permission enforcement: 10 tests
- [ ] Team member flow: 5 tests

**E2E Tests** (if using Cypress)
- [ ] Complete user signup for clinic
- [ ] Create organization & invite team
- [ ] Doctor logs in, creates patient
- [ ] Staff logs in, can view but not edit
- [ ] Admin can see all data

**Security Tests**
- [ ] Firestore rules emulator tests: 20+ test cases
- [ ] Cross-org data access attempt (should fail)
- [ ] Permission bypass attempt (should fail)

---

## 📊 Tracking & Metrics

### Daily Standup Agenda
```
✅ Completed Yesterday
  - [Name] Completed [Task #, e.g. "1.1 Design Organization Model"]
  
🔄 In Progress Today
  - [Name] Working on [Task] - [% complete]
  
🚧 Blockers
  - [Any blocking issues]
```

### Weekly Checkpoint (Every Friday)
```
✅ Features Completed This Week:
✅ Tests Passing: X/X (target: 100%)
✅ Code Review Pending: X reviews
🔴 At Risk: [Any at-risk items]
📊 Tracking: [Phase X progress]
👥 Team Velocity: [story points completed]
```

### Phase Completion Criteria

**Phase 1 DONE when:**
- [ ] Multi-org working end-to-end
- [ ] ≥100 tests passing
- [ ] All 10 core features working
- [ ] Security rules reviewed
- [ ] Internal testing clean
- [ ] Ready for Phase 2

---

## 🚀 Quick Links

| Document | Purpose | Use When |
|----------|---------|----------|
| `SAAS_READINESS_ASSESSMENT.md` | Complete analysis | Strategizing, decision-making |
| `SAAS_TRANSFORMATION_GUIDE.md` | Technical deep-dive | Implementing features |
| `SAAS_EXECUTIVE_SUMMARY.md` | Business case | Board meetings, stakeholder updates |
| This file | Day-to-day tracking | Daily standups, sprint planning |

---

## 🎯 Success Definition

**Phase 1 Success = MVP Ready**
```
✅ 2+ organizations with data
✅ Team member invitations working
✅ Roles & permissions enforced
✅ 100+ tests passing
✅ No security issues found
✅ Production-ready code quality
```

**Ready to proceed to Phase 2 (Monetization)** once Phase 1 complete! 🎉

---

**Last Updated:** February 26, 2026  
**Next Review:** Fri, Mar 7, 2026 (Weekly retrospective)
