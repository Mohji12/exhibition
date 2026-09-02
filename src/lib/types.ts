export type Priority = "hot" | "warm" | "cold";

export type CaptureSource = "qr" | "card" | "manual";

export type CaptureMeta = {
  rawQr?: string;
  ocrText?: string;
  ocrConfidence?: number;
  transcript?: string;
  verifiedAt?: string;
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
