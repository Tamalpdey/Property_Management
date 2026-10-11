import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  Clock,
  FileText,
  FlaskConical,
  Layers,
  Palette,
  PlugZap,
  Receipt,
  Repeat,
  Settings2,
  ShieldCheck,
  Smartphone,
  Workflow,
} from "lucide-react";

/** "Who we are" page copy, from the Boreal Vision Statement (October 4, 2026). */

export const statement = {
  vision: {
    lead: "The platform that service and manufacturing businesses run on.",
    detail:
      "Shaped around the way each company works, and delivered with the cost and simplicity of standard software.",
  },
  mission: [
    "Boreal provides a single, secure, multi-tenant platform that connects the full commercial and operational lifecycle of a business, from quote or order through execution, time capture and invoicing.",
    "Each client operates a dedicated, branded workspace that reflects its terminology, workflows and documents, while Boreal maintains one continuously improved system beneath.",
  ],
  name: "The name draws on Canada's boreal forest, which spans more than half the country: expansive, resilient and deeply rooted. Those are the qualities we intend our platform to bring to the businesses that depend on it, beginning in Canada and extending beyond it.",
  nameQualities: ["Expansive", "Resilient", "Deeply rooted"],
};

export const market = {
  intro:
    "Small and mid-sized service and manufacturing businesses face an unsatisfactory choice.",
  options: [
    {
      title: "General-purpose tools & spreadsheets",
      verdict: "Inexpensive, but fragmented",
      body: "They fragment information once jobs, staff and billing must be coordinated.",
    },
    {
      title: "Enterprise resource planning (ERP)",
      verdict: "Deep, but heavy",
      body: "They require lengthy implementations and carry costs scaled to far larger organizations.",
    },
    {
      title: "Custom-built software",
      verdict: "Fits at first",
      body: "It then becomes a maintenance liability.",
    },
  ],
  consequences: [
    "Duplicated data entry",
    "Quotes that are never converted",
    "Labour hours that go unbilled",
    "Little visibility into job profitability until after the work is complete",
  ],
  sequence: ["Request", "Quote or order", "Work", "Tracked to completion", "Invoiced"],
  sequenceNote:
    "These businesses nonetheless share a common operational sequence. Terminology and detail vary by industry; the underlying structure does not. Boreal is built on that structure.",
};

export const solution = {
  intro:
    "Boreal is a platform of composable business modules on a common foundation. Clients activate the modules their operations require.",
  modules: [
    { icon: FileText, title: "Quotes and orders", body: "Pricing, approval workflows and customer-facing documents." },
    {
      icon: Workflow,
      title: "Work and process management",
      body: "Work orders, production stages, assignment and status tracking.",
    },
    { icon: Clock, title: "Time and labour", body: "Worker clock-in and clock-out, recorded against specific jobs." },
    {
      icon: Palette,
      title: "Product customization",
      body: "Customer-supplied artwork, logos and product options, with an approval step.",
    },
    {
      icon: Receipt,
      title: "Invoicing",
      body: "Generated directly from approved quotes, completed work and recorded time.",
    },
  ] satisfies { icon: LucideIcon; title: string; body: string }[],
  foundation: ["Customers", "Products and services", "Users and permissions", "Documents", "Complete audit history"],
  workspace:
    "Each client receives a dedicated, branded workspace. The experience presented to the client's own customers carries the client's brand, not Boreal's.",
  workspaceIncludes: [
    "Its own domain",
    "Visual identity",
    "Terminology",
    "Data fields",
    "Workflow stages",
    "Document templates",
    "Notifications",
  ],
};

export const principles: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Layers,
    title: "One platform, many tenants.",
    body: "All clients run on shared infrastructure with strict data isolation. There are no client-specific code branches or deployments.",
  },
  {
    icon: Settings2,
    title: "Configuration before customization.",
    body: "Branding, terminology, fields, workflows, templates and roles are managed as settings, not code. Where a requirement cannot be met through configuration, we either develop it as a reusable capability for all clients or decline it.",
  },
  {
    icon: Repeat,
    title: "Modular by design.",
    body: "Each capability operates independently and is enabled per client, so entry into a new industry builds on existing modules rather than starting anew.",
  },
  {
    icon: PlugZap,
    title: "Open and integrated.",
    body: "An application programming interface (API) and event framework are available from the first release, so accounting, payment and e-commerce systems connect to Boreal rather than being replicated within it.",
  },
  {
    icon: Smartphone,
    title: "Usable at every level.",
    body: "A field technician clocking in on a mobile device, or a production operator advancing a batch, should be able to do so without formal training.",
  },
  {
    icon: ShieldCheck,
    title: "Secure and compliant by default.",
    body: "Client data is protected, auditable and handled in line with Canadian privacy requirements, including PIPEDA.",
  },
];

export const deployments = {
  intro:
    "Our first two clients operate in distinct sectors. Together they demonstrate that the platform serves a horizontal need rather than a single industry.",
  clients: [
    {
      icon: Building2,
      client: "Property management company",
      requirements: ["Quotes", "Work order management", "Worker time clocking", "Invoicing"],
      capability: "Field service execution, labour capture, quote-to-invoice for jobs",
    },
    {
      icon: FlaskConical,
      client: "Lip balm manufacturer",
      requirements: ["Order management", "Logo customization", "Process tracking", "Invoicing"],
      capability: "Configurable products, customer artwork approval, staged production, order-to-invoice",
    },
  ],
  shared:
    "Capabilities common to both clients, including quoting and ordering, progress tracking and invoicing, are developed once. Client-specific requirements are generalized into reusable modules.",
  generalized: [
    { from: "Logo customization", to: "Customer artwork management" },
    { from: "Time clocking", to: "Labour capture, available to any future client" },
  ],
};

export const direction = {
  intro:
    "Boreal will expand into industries that share the same operational sequence of request, quote or order, execution, tracking and invoicing.",
  industries: [
    { group: "Field services", items: ["Cleaning", "HVAC", "Landscaping"] },
    { group: "Light manufacturing", items: ["Cosmetics", "Food production", "Printing", "Custom goods"] },
  ],
  disciplines: [
    {
      icon: ClipboardList,
      title: "The new-industry test.",
      body: "A new industry should be served primarily through existing modules and configuration. Where it would require predominantly new development, it falls outside our current scope.",
    },
    {
      icon: Layers,
      title: "Foundation before advanced capability.",
      body: "Industry templates, an integration marketplace, operational analytics and intelligent assistance with quoting and scheduling all depend on consistent, high-quality operational data. We will establish that foundation first, then build on it.",
    },
  ],
};

export const boundaries = {
  willNot: [
    "Develop bespoke software for individual clients",
    "Position itself as a general-purpose ERP",
    "Replace established accounting systems; we will integrate with them",
    "Compromise client data isolation or security in the interest of speed",
  ],
  measures: [
    { title: "Client onboarding time", body: "Measured in days rather than months." },
    {
      title: "Configuration coverage",
      body: "The proportion of client requirements met without new development, increasing with each client.",
    },
    { title: "Client quote-to-cash cycle", body: "The time from quote to payment, reduced following adoption." },
    { title: "Client retention", body: "The ultimate confirmation that the platform delivers lasting value." },
  ],
};
