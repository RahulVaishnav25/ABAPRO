export type ClientStatus = 'active' | 'inactive';
export type ProgramStatus = 'active' | 'paused' | 'completed' | 'discontinued';
export type GuardianRelationship = 'parent' | 'guardian' | 'grandparent' | 'caregiver' | 'other';
export type ContactChannel = 'email' | 'phone' | 'portal';
export type MeasurementType = 'frequency' | 'duration' | 'interval' | 'latency' | 'rate';
export type BehaviorStatus = 'active' | 'discontinued';
export type GoalStatus = 'active' | 'met' | 'discontinued';
export type DocumentCategory = 'record' | 'assessment' | 'care' | 'supporting' | 'avatar';
export type AssignmentRelationship = 'therapist' | 'supervisor' | 'guardian';
export type TherapySessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface PersonRef {
  id: string;
  name: string;
}

export interface ClientDirectoryItem {
  id: string;
  displayName: string;
  preferredName: string | null;
  clientCode: string;
  organizationId: string;
  organizationName: string;
  clinicId: string | null;
  clinicName: string | null;
  initials: string;
  hasAvatar: boolean;
  dateOfBirth?: string | null;
  therapists: PersonRef[];
  supervisor: PersonRef | null;
  status: ClientStatus;
  activeProgramCount: number;
  lastSessionAt: string | null;
  createdAt: string;
}

export interface ClientDirectoryPage {
  items: ClientDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientAssignmentView {
  id: string;
  userId: string;
  name: string;
  relationship: AssignmentRelationship;
  endedAt: string | null;
}

export interface ClientGuardian {
  id: string;
  name: string;
  relationship: GuardianRelationship;
  email: string | null;
  phone: string | null;
  channels: ContactChannel[];
  emergencyContact: boolean;
  portalAccess: boolean;
  linkedUserId: string | null;
  endedAt: string | null;
}

export interface ClientPlacementClinic {
  id: string;
  name: string;
}

export interface ClientPlacementOrganization {
  id: string;
  name: string;
  clinics: ClientPlacementClinic[];
}

export interface ClientPlacement {
  organizations: ClientPlacementOrganization[];
}

export interface ClientProfile {
  id: string;
  organizationId: string;
  organizationName: string;
  clinicId: string | null;
  clinicName: string | null;
  displayName: string;
  preferredName: string | null;
  clientCode: string;
  initials: string;
  hasAvatar: boolean;
  language: string | null;
  timezone: string | null;
  status: ClientStatus;
  dateOfBirth?: string | null;
  createdAt: string;
  updatedAt: string;
  therapists: PersonRef[];
  supervisor: PersonRef | null;
  assignments: ClientAssignmentView[];
  guardians: ClientGuardian[];
  activeProgramCount: number;
  lastSessionAt: string | null;
}

export interface ClinicalProfile {
  medicalHistory: string;
  allergies: string;
  precautions: string;
  communicationPreferences: string;
  summary: string;
}

export interface ClientBehavior {
  id: string;
  name: string;
  operationalDefinition: string;
  measurementType: MeasurementType;
  measurementNotes: string | null;
  status: BehaviorStatus;
}

export interface ClientGoal {
  id: string;
  statement: string;
  objective: string | null;
  assessmentReference: string | null;
  reviewOn: string | null;
  status: GoalStatus;
}

export interface AssessmentReference {
  id: string;
  title: string;
  instrument: string | null;
  completedOn: string | null;
  notes: string | null;
}

export interface ClientProgramView {
  id: string;
  name: string;
  status: ProgramStatus;
  targets: Array<{ id: string; name: string; phase: string }>;
}

export interface ClientSessionView {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: TherapySessionStatus;
  observationCount: number;
  therapistName: string | null;
}

export interface ClientDocumentView {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  category: DocumentCategory;
  scanStatus: 'not_configured' | 'rejected';
  createdAt: string;
}

export interface ClientActivity {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export interface DemoSeedResult {
  created: number;
}
