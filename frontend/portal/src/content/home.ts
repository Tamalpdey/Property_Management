import type { LucideIcon } from "lucide-react";
import {
  Box,
  Building2,
  CalendarDays,
  Camera,
  CircleCheck,
  Clipboard,
  ClipboardCheck,
  HardHat,
  MessageSquareText,
  Receipt,
  Repeat,
  Route,
  Truck,
  UserCheck,
  Wrench,
} from "lucide-react";

/** Approved homepage copy, ported from the prototype's build_pages.py. */

/** Same destinations as the live site (deploy/ec2/maple-site/index.html). */
export const links = {
  tenantLogin: "https://app.maplepropertyservices.ca/login",
  workerLogin: "https://worker.maplepropertyservices.ca/login",
} as const;

// Section links are root-relative so they also work from other pages.
export const navItems = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#workflow" },
  { label: "Workspaces", href: "/#workspaces" },
  { label: "Who we are", href: "/who-we-are" },
] as const;

export type SceneId = 0 | 1 | 2 | 3 | 4 | 5;

export interface Stage {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
}

export const stages: Stage[] = [
  {
    icon: Clipboard,
    label: "Plan",
    title: "Start with a clear work order.",
    body: "Bring property-related tasks into one place, ready for office coordination.",
  },
  {
    icon: UserCheck,
    label: "Assign",
    title: "Put the day in order.",
    body: "Coordinate workers, routes, and service windows around the work ahead.",
  },
  {
    icon: Camera,
    label: "Document",
    title: "Keep the detail with the job.",
    body: "Capture time, notes, photos, and field records while the work is happening.",
  },
  {
    icon: CircleCheck,
    label: "Review",
    title: "Bring the field back to the office.",
    body: "Review submitted records before communicating that work is complete.",
  },
  {
    icon: MessageSquareText,
    label: "Update",
    title: "Keep owners in the loop.",
    body: "Share reviewed completion notices with a record of delivery.",
  },
  {
    icon: Receipt,
    label: "Invoice",
    title: "Connect the work to its costs.",
    body: "Prepare owner invoices and review the financial picture by work order.",
  },
];

export type PhotoKind = "field" | "office" | "review";

export interface Feature {
  label: string;
  title: string;
  body: string;
  scene: SceneId;
  photo: PhotoKind;
}

export const features: Feature[] = [
  {
    label: "Planning & dispatch",
    title: "Give every job a place in the plan.",
    body: "Organize work orders, workers, routes, and service windows.",
    scene: 1,
    photo: "office",
  },
  {
    label: "Field records",
    title: "Keep the record with the work.",
    body: "Record shifts and job activity, capture notes and photos, and prepare day tickets for review.",
    scene: 2,
    photo: "field",
  },
  {
    label: "Review & owner updates",
    title: "Connect field records to owner communication.",
    body: "Review field submissions and send completion notices with an auditable delivery log.",
    scene: 3,
    photo: "review",
  },
  {
    label: "Invoicing & job costs",
    title: "See the financial picture of each job.",
    body: "Invoice owners and review revenue, estimated labor cost, material cost, profit, and margin by work order.",
    scene: 5,
    photo: "office",
  },
];

export const roles = [
  {
    kind: "office" as const,
    eyebrow: "OFFICE WORKSPACE",
    title: "For the office",
    body: "Coordinate properties, work orders, field review, and invoices.",
    href: links.tenantLogin,
    linkLabel: "Tenant Login",
    tag: "A clearer view of the day.",
    tagIcon: CalendarDays,
  },
  {
    kind: "field" as const,
    eyebrow: "FIELD WORKSPACE",
    title: "For the field",
    body: "View assigned jobs, record time, and capture notes, photos, and day tickets.",
    href: links.workerLogin,
    linkLabel: "Worker Login",
    tag: "The job details. Right with you.",
    tagIcon: Camera,
  },
];

export const workTypes: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Wrench, title: "Service", body: "General maintenance and repairs." },
  { icon: ClipboardCheck, title: "Inspection", body: "Scheduled and on-demand checks." },
  { icon: Truck, title: "Pickup", body: "Collect items from properties." },
  { icon: Box, title: "Delivery", body: "Deliver materials, equipment, or supplies." },
  { icon: Route, title: "Routes", body: "Organize service routes." },
  { icon: Repeat, title: "Recurring maintenance", body: "Keep properties on schedule." },
];

export const workspaceChoices = [
  { icon: Building2, title: "Office operations", label: "Tenant Login", href: links.tenantLogin },
  { icon: HardHat, title: "Field work", label: "Worker Login", href: links.workerLogin },
];

export const photos: Record<PhotoKind, { src: string; alt: string }> = {
  field: {
    src: "/images/field-editorial.jpg",
    alt: "A technician inspecting a residential property with a tablet",
  },
  office: {
    src: "/images/office-editorial.jpg",
    alt: "An office coordinator planning work at her desk",
  },
  review: {
    src: "/images/review-editorial.jpg",
    alt: "Two colleagues reviewing a maintenance job together",
  },
};
