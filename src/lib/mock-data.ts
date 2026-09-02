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

export const PRODUCT_INTERESTS = [
  "Medical Equipment",
  "Surgical",
  "Diagnostics",
  "Software",
  "AI Solutions",
  "Hospital Infrastructure",
];

export const SAMPLE_SUMMARY =
  "Discussed ICU-grade equipment requirements for an upcoming expansion. Visitor asked for indicative pricing, service SLAs and a product demo. Action: share quotation and schedule a demo within the week.";

export const INITIAL_LEADS: Lead[] = [
  {
    id: "1",
    name: "Dr. Ananya Rao",
    company: "Fortis Medical Centre",
    designation: "Chief Procurement Officer",
    mobile: "+91 98765 43210",
    email: "ananya.rao@fortismedical.example",
    city: "Mumbai",
    priority: "hot",
    interests: ["Medical Equipment", "Diagnostics"],
    summary:
      "Interested in ICU ventilators for a 300-bed expansion. Requested pricing and a product demo next week. Budget approved for this quarter.",
    synced: true,
    capturedAt: "Today, 14:32",
    consentAt: "14:32",
  },
  {
    id: "2",
    name: "Rajesh Kumar",
    company: "CityCare Hospitals",
    designation: "Purchase Manager",
    mobile: "+91 91234 56780",
    email: "rajesh.kumar@citycare.example",
    city: "Pune",
    priority: "warm",
    interests: ["Surgical", "Hospital Infrastructure"],
    summary:
      "Exploring surgical equipment upgrade for new wing, timeline is 6+ months out. Wants brochure emailed.",
    synced: true,
    capturedAt: "Today, 13:05",
    consentAt: "13:04",
  },
  {
    id: "3",
    name: "Dr. Meera Nair",
    company: "Sunrise Diagnostics",
    designation: "Director",
    mobile: "+91 99887 66554",
    email: "meera.nair@sunrisediag.example",
    city: "Kochi",
    priority: "hot",
    interests: ["Diagnostics", "AI Solutions"],
    summary:
      "Very engaged, asked detailed questions about AI-assisted diagnostic imaging. Wants a follow-up call this week.",
    synced: false,
    capturedAt: "Today, 12:20",
    consentAt: "12:18",
  },
  {
    id: "4",
    name: "Faisal Ahmed",
    company: "Al Noor Hospital Group",
    designation: "IT Director",
    mobile: "+91 90000 11223",
    email: "faisal.ahmed@alnoorhealth.example",
    city: "Hyderabad",
    priority: "warm",
    interests: ["Software", "AI Solutions"],
    summary: "",
    synced: false,
    capturedAt: "Today, 11:40",
  },
  {
    id: "5",
    name: "Sunita Deshpande",
    company: "Wellness Care Clinics",
    designation: "Operations Head",
    mobile: "+91 98111 22334",
    email: "sunita.d@wellnesscare.example",
    city: "Nagpur",
    priority: "cold",
    interests: ["Hospital Infrastructure"],
    summary: "Just browsing, took a brochure.",
    synced: true,
    capturedAt: "Today, 10:15",
  },
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "a1",
    lead: "Dr. Ananya Rao",
    type: "Product Demo",
    when: "Tomorrow, 11:00 AM",
    status: "Confirmed",
  },
  {
    id: "a2",
    lead: "Dr. Meera Nair",
    type: "Online call",
    when: "Thu, 3:00 PM",
    status: "Pending",
  },
  {
    id: "a3",
    lead: "Rajesh Kumar",
    type: "Site Visit",
    when: "Next Mon, 10:00 AM",
    status: "Confirmed",
  },
];

export const TEAM: TeamMember[] = [
  { name: "Ditto", role: "Rep", email: "ditto@conninter.example" },
  { name: "Priya S.", role: "Rep", email: "priya@conninter.example" },
  { name: "Conninter Admin", role: "Admin", email: "admin@conninter.example" },
];
