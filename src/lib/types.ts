export type Priority = "hot" | "warm" | "cold";

export type CaptureSource = "qr" | "card" | "manual";

export type CaptureMeta = {
  rawQr?: string;
  ocrText?: string;
  ocrConfidence?: number;
  transcript?: string;
  verifiedAt?: string;
  aiVerifiedAt?: string;
  aiIssues?: string[];
  ocrQuality?: "good" | "fair" | "poor";
  cardImageId?: string;
  fieldConfidence?: Partial<Record<string, number>>;
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  designation: string;
  mobile: string;
  email: string;
  city: string;
  priority: Priority;
  interests: string[];
  summary: string;
  synced: boolean;
  capturedAt: string;
  consentAt?: string;
  captureSource?: CaptureSource;
  captureMeta?: CaptureMeta;
  fieldConfidence?: Partial<Record<keyof Lead, number>>;
  capturedBy?: string | null;
  capturerName?: string | null;
  capturerEmail?: string | null;
};

export type AppointmentType = "Online call" | "Physical" | "Product Demo" | "Site Visit";

export type Appointment = {
  id: string;
  lead: string;
  type: AppointmentType;
  when: string;
  status: "Confirmed" | "Pending" | "Rescheduled";
};

export type TeamMember = {
  name: string;
  role: "Rep" | "Admin";
  email: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "Rep" | "Admin";
  status: "active" | "disabled";
  company?: string | null;
  designation?: string | null;
  mobile?: string | null;
  shareToken?: string | null;
  createdAt?: string | null;
  activatedAt?: string | null;
  leadsCaptured?: number;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type InterestCount = {
  name: string;
  count: number;
};

export type CaptureSourceBreakdown = {
  qr: number;
  card: number;
  manual: number;
  unknown: number;
};

export type AppointmentStatusBreakdown = {
  confirmed: number;
  pending: number;
  rescheduled: number;
};

export type AdminOverview = {
  staffActive: number;
  staffDisabled: number;
  admins: number;
  leads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  syncedLeads: number;
  unsyncedLeads: number;
  pendingFollowUps: number;
  bySource: CaptureSourceBreakdown;
  topInterests: InterestCount[];
  appointmentsByStatus: AppointmentStatusBreakdown;
};

export type InvitePin = {
  token: string;
  pin: string;
  expiresAt: string;
};

export type AdminLeadFilters = {
  q?: string;
  priority?: Priority;
  synced?: boolean;
  source?: CaptureSource | "unknown";
  capturedBy?: string;
};
