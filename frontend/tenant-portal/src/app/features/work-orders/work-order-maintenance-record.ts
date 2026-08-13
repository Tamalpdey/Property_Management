import type {
  MaintenanceRecordTemplate,
  MaintenanceTemplateDelivery,
  MaintenanceTemplateOption,
  TenantSettingsRecord,
  WorkOrderMaterial,
  WorkOrderReview
} from '@lorne/contracts';

const MAINTENANCE_CHECKS = [
  'Pool Vacuumed',
  'Waterline Cleaned',
  'Pool Skimmed',
  'Pool Brushed',
  'Pump Basket Emptied',
  'Skimmer Emptied',
  'Filter Backwashed',
  'Water Added',
  'Pool Vac System Cleaned',
  'Pool Vac System Tested'
];

const MEASUREMENTS = [
  'Pool Filter Pressure',
  'Pool Temperature',
  'Whirlpool Filter Pressure',
  'Whirlpool Temperature'
];

const CHEMICALS = ['Cl/Br', 'pH', 'TA', 'CAL', 'STAB', 'SALT', 'RATE'];

const DEFAULT_DELIVERIES = [
  'L Liquid Chlorine',
  '7 kg Chlorine Tablets',
  '7 kg Granular Shock',
  '8 kg Lithium Shock',
  '8 kg Buffer',
  '3.5 kg pH Increaser',
  '1 L MSR Sequerian Agent',
  '1 L 4LG Algaecide',
  '4 L Muriatic Acid',
  '1.75 kg Cyanuric Acid',
  '20 kg Pool Salt'
];

const EMPTY_TEMPLATE: MaintenanceRecordTemplate = {
  enabled: false,
  title: 'Maintenance record',
  callTypes: [],
  checks: [],
  measurements: [],
  chemicals: [],
  deliveries: [],
  noteLabel: 'Client note'
};

const POOL_TEMPLATE: MaintenanceRecordTemplate = {
  enabled: true,
  title: 'Pool maintenance record',
  callTypes: [
    { key: 'maintenance', label: 'Maintenance (1-14)', defaultSelected: true, match: ['pool', 'maintenance'] },
    { key: 'chemical', label: 'Chemical Check (3-14)', match: ['chemical', 'chlorine', 'ph'] },
    { key: 'other', label: 'Other' }
  ],
  checks: [...MAINTENANCE_CHECKS, ...MEASUREMENTS].map((label, index) => ({ key: `check-${index + 1}`, label })),
  measurements: MEASUREMENTS.map((label) => ({ key: normalize(label), label, unit: label.includes('Temperature') ? 'F/C' : 'psi' })),
  chemicals: CHEMICALS.map((label) => ({ key: normalize(label), label, unit: unitForChemical(label) })),
  deliveries: DEFAULT_DELIVERIES.map((label) => ({ key: normalize(label), label })),
  noteLabel: 'Client - Please Note'
};

export function maintenanceRecordPrintHtml(review: WorkOrderReview, settings?: TenantSettingsRecord | null): string {
  const workOrder = review.workOrder;
  const brand = tenantBrand(settings);
  const serviceName = workOrder.serviceName || workOrder.title || 'General service';
  const template = maintenanceTemplate(workOrder.maintenanceRecordTemplate, serviceName);
  const templateChecks = template.checks ?? [];
  const templateMeasurements = template.measurements ?? [];
  const templateChemicals = template.chemicals ?? [];
  const templateDeliveries = template.deliveries ?? [];
  const savedRecord = review.maintenanceRecords?.[0] ?? null;
  const recordData = savedRecord?.recordData ?? {};
  const checkedTaskLabels = new Set(
    workOrder.tasks
      .filter((task) => task.completed)
      .map((task) => normalize(task.label))
  );
  const usedMaterials = workOrder.materials.filter((material) => material.used);
  const deliveryRows = deliveryLabels(usedMaterials, templateDeliveries, recordData.deliveries);
  const fieldNoteText = review.fieldNotes
    .map((note) => `${note.workerName}: ${note.note}`)
    .join('\n');
  const clientNote = recordData.clientNote || fieldNoteText || workOrder.description || '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(workOrder.workOrderNumber)} Maintenance Record</title>
  <style>
    @page { size: letter; margin: 0.35in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      line-height: 1.2;
    }
    .sheet {
      min-height: 10.25in;
      border: 1.5pt solid #1f2937;
      padding: 12pt 16pt 10pt;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 16pt;
      margin-bottom: 8pt;
    }
    .brand { display: flex; align-items: center; gap: 10pt; min-width: 0; }
    .logo {
      width: 46pt;
      height: 34pt;
      object-fit: contain;
      border: 1px solid #d1d5db;
      padding: 2pt;
    }
    .logo-placeholder {
      display: grid;
      place-items: center;
      width: 46pt;
      height: 34pt;
      border: 1px solid #9ca3af;
      color: #0f766e;
      font-size: 15pt;
      font-weight: 900;
    }
    .company { min-width: 0; }
    .company-name {
      margin: 0;
      font-size: 16pt;
      font-weight: 900;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .company-subtitle { margin: 2pt 0 0; color: #475569; font-size: 7.5pt; font-weight: 700; }
    .title { text-align: right; }
    h1 { margin: 2pt 0 8pt; font-size: 17pt; letter-spacing: 0.01em; }
    .ticket-no { font-size: 10pt; font-weight: 800; }
    .form-grid { display: grid; grid-template-columns: minmax(0, 1fr) 100pt minmax(0, 1fr); column-gap: 12pt; row-gap: 6pt; }
    .field { display: grid; grid-template-columns: auto 1fr; align-items: end; gap: 6pt; min-width: 0; }
    .field strong { white-space: nowrap; }
    .line {
      min-height: 14pt;
      border-bottom: 1.2pt solid #111827;
      padding: 0 4pt 2pt;
      font-size: 9pt;
      font-weight: 700;
    }
    .date-line { display: grid; grid-template-columns: 1fr; text-align: center; }
    .date-value { border-bottom: 1.2pt solid #111827; padding-bottom: 2pt; font-size: 9pt; font-weight: 700; }
    .date-labels { display: flex; justify-content: space-around; color: #475569; font-size: 6.5pt; font-weight: 800; text-transform: uppercase; }
    h2 { margin: 8pt 0 4pt; font-size: 8.5pt; letter-spacing: 0.03em; text-transform: uppercase; }
    .call-types { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; margin-bottom: 4pt; }
    .check-row { display: grid; grid-template-columns: 1fr 12pt; align-items: center; gap: 6pt; min-height: 17pt; }
    .box {
      display: inline-grid;
      place-items: center;
      width: 10pt;
      height: 10pt;
      border: 1.2pt solid #111827;
      font-size: 8pt;
      font-weight: 900;
      line-height: 1;
    }
    .service-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt; }
    .measurement-row { display: grid; grid-template-columns: 1fr 54pt 18pt; align-items: end; gap: 4pt; min-height: 16pt; }
    .short-line { border-bottom: 1.2pt solid #111827; min-height: 13pt; text-align: center; font-weight: 700; }
    .chemical-grid {
      display: grid;
      grid-template-columns: 78pt repeat(${Math.max(templateChemicals.length, 1)}, 1fr);
      border-top: 1px solid #cbd5e1;
      border-left: 1px solid #cbd5e1;
    }
    .chemical-grid > div {
      min-height: 22pt;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 4pt;
      text-align: center;
    }
    .chemical-grid .label { text-align: left; font-weight: 800; }
    .deliveries {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 28pt;
      row-gap: 3pt;
    }
    .delivery-line { display: grid; grid-template-columns: 70pt 1fr; align-items: end; gap: 6pt; min-height: 16pt; }
    .notes {
      min-height: 82pt;
      border-bottom: 1.2pt solid #111827;
      background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 19pt, #9ca3af 19.5pt);
      padding: 4pt 4pt 0;
      white-space: pre-wrap;
      font-size: 9pt;
      font-weight: 700;
      line-height: 19pt;
    }
    footer {
      margin-top: 8pt;
      border-top: 2pt solid #111827;
      padding-top: 5pt;
      text-align: center;
      color: #4b5563;
      font-size: 8pt;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <div class="brand">
        ${brand.logoUrl ? `<img class="logo" src="${escapeAttribute(brand.logoUrl)}" alt="${escapeAttribute(brand.name)} logo">` : `<div class="logo-placeholder">${escapeHtml(initials(brand.name))}</div>`}
        <div class="company">
          <p class="company-name">${escapeHtml(brand.name)}</p>
          ${brand.legalName ? `<p class="company-subtitle">${escapeHtml(brand.legalName)}</p>` : ''}
          ${brand.address ? `<p class="company-subtitle">${escapeHtml(brand.address)}</p>` : ''}
        </div>
      </div>
      <div class="title">
        <h1>Maintenance Record</h1>
        <p class="ticket-no">${escapeHtml(workOrder.workOrderNumber)}</p>
      </div>
    </header>

    <section class="form-grid">
      <div class="field"><strong>Client Name:</strong><span class="line">${escapeHtml(workOrder.ownerName || workOrder.propertyName)}</span></div>
      <div class="date-line"><span class="date-value">${escapeHtml(formatDateOnly(workOrder.scheduledStart))}</span><span class="date-labels"><span>Day</span><span>DD</span><span>MMM</span><span>YYYY</span></span></div>
      <div class="field"><strong>Staff:</strong><span class="line">${escapeHtml(workerNames(review))}</span></div>
      <div class="field"><strong>Client Street:</strong><span class="line">${escapeHtml(workOrder.propertyAddress || '')}</span></div>
      <div class="field"><strong>#</strong><span class="line">${escapeHtml(workOrder.workOrderNumber)}</span></div>
      <div class="field"><strong>Service:</strong><span class="line">${escapeHtml(serviceName)}</span></div>
    </section>

    <h2>Call Type</h2>
    <section class="call-types">
      ${(template.callTypes?.length ? template.callTypes : [{ key: 'other', label: 'Other: ' + serviceName }])
        .map((callType) => callTypeBox(callType.label, Boolean(recordData.callTypes?.[callType.key]) || callTypeSelected(callType, serviceName, usedMaterials)))
        .join('')}
    </section>

    <section class="service-grid">
      <div>${templateChecks.slice(0, Math.ceil(templateChecks.length / 2)).map((item, index) => serviceCheck(index + 1, item.key, item.label, checkedTaskLabels, recordData.serviceChecks)).join('')}</div>
      <div>${templateChecks.slice(Math.ceil(templateChecks.length / 2)).map((item, index) => serviceCheck(index + 1 + Math.ceil(templateChecks.length / 2), item.key, item.label, checkedTaskLabels, recordData.serviceChecks)).join('')}</div>
      <div>${templateMeasurements.map((item, index) => measurementRow(index + 1, item.key, item.label, item.unit || '', recordData.measurements)).join('')}</div>
    </section>

    <h2>Chemical Readings</h2>
    <section class="chemical-grid">
      <div></div>
      ${templateChemicals.map((chemical) => `<div><strong>${escapeHtml(chemical.label)}</strong></div>`).join('')}
      <div class="label">Pool / Spa</div>
      ${templateChemicals.map((chemical) => `<div><span class="short-line">${escapeHtml(recordData.chemicalValues?.[chemical.key] || '')}</span> ${escapeHtml(chemical.unit || '')}</div>`).join('')}
      <div class="label">Adjusted</div>
      ${templateChemicals.map((chemical) => `<div>${chemicalAdjustedBox(chemical.key, chemical.label, usedMaterials, recordData.adjusted)}</div>`).join('')}
      <div class="label">Within Range</div>
      ${templateChemicals.map((chemical) => `<div><span class="box">${recordData.withinRange?.[chemical.key] ? 'x' : ''}</span></div>`).join('')}
    </section>

    <h2>Deliveries</h2>
    <section class="deliveries">
      ${deliveryRows.map((label) => deliveryRow(label)).join('')}
    </section>

    <h2>Client - Please Note</h2>
    <section class="notes">${escapeHtml(clientNote)}</section>

    <footer>${escapeHtml(brand.contact || [settings?.phone, settings?.supportEmail, settings?.websiteUrl].filter(Boolean).join(' | ') || '')}</footer>
  </main>
</body>
</html>`;
}

function callTypeBox(label: string, checked: boolean): string {
  return `<div class="check-row"><span>${escapeHtml(label)}</span><span class="box">${checked ? 'x' : ''}</span></div>`;
}

function serviceCheck(index: number, key: string, label: string, completedTaskLabels: Set<string>, savedChecks?: Record<string, boolean>): string {
  const checked = Boolean(savedChecks?.[key])
    || completedTaskLabels.has(normalize(label))
    || [...completedTaskLabels].some((taskLabel) => taskLabel.includes(normalize(label)));
  return `<div class="check-row"><span>${index}. ${escapeHtml(label)}</span><span class="box">${checked ? 'x' : ''}</span></div>`;
}

function measurementRow(index: number, key: string, label: string, unit: string, savedMeasurements?: Record<string, string>): string {
  return `<div class="measurement-row"><span>${index}. ${escapeHtml(label)}</span><span class="short-line">${escapeHtml(savedMeasurements?.[key] || '')}</span><span>${escapeHtml(unit)}</span></div>`;
}

function chemicalAdjustedBox(key: string, label: string, materials: WorkOrderMaterial[], savedAdjusted?: Record<string, boolean>): string {
  if (savedAdjusted?.[key]) {
    return '<span class="box">x</span>';
  }
  const normalized = normalize(label);
  const adjusted = materials.some((material) =>
    normalize(material.itemName || material.description).includes(normalized) ||
    normalize(material.itemName || material.description).includes(chemicalKeyword(label))
  );
  return `<span class="box">${adjusted ? 'x' : ''}</span>`;
}

function deliveryLabels(materials: WorkOrderMaterial[], templateDeliveries: MaintenanceTemplateDelivery[], savedDeliveries?: Record<string, string>): string[] {
  const saved = templateDeliveries
    .map((delivery) => [savedDeliveries?.[delivery.key], delivery.label].filter(Boolean).join(' '))
    .filter(Boolean);
  const used = materials.map((material) => {
    const quantity = [material.quantity, material.unit].filter((part) => part !== undefined && part !== null && String(part).trim()).join(' ');
    return [quantity, material.itemName || material.description].filter(Boolean).join(' ');
  });
  const templateLabels = templateDeliveries.map((delivery) => delivery.label);
  const combined = [...saved, ...used, ...templateLabels.filter((label) =>
    !saved.some((savedLabel) => normalize(savedLabel).includes(normalize(label))) &&
    !used.some((usedLabel) => normalize(usedLabel).includes(normalize(label)))
  )];
  return combined.slice(0, 12);
}

function deliveryRow(label: string): string {
  return `<div class="delivery-line"><span class="short-line"></span><span>${escapeHtml(label)}</span></div>`;
}

function workerNames(review: WorkOrderReview): string {
  return review.workOrder.assignments.map((assignment) => assignment.workerName).join(', ');
}

function callTypeSelected(callType: MaintenanceTemplateOption, serviceName: string, materials: WorkOrderMaterial[]): boolean {
  if (callType.defaultSelected) {
    return true;
  }
  const serviceText = normalize(serviceName);
  const materialText = normalize(materials.map((material) => [material.itemName, material.description].filter(Boolean).join(' ')).join(' '));
  return (callType.match ?? []).some((match) => {
    const value = normalize(match);
    return serviceText.includes(value) || materialText.includes(value);
  });
}

function unitForChemical(label: string): string {
  return label === 'RATE' ? '%' : 'ppm';
}

function chemicalKeyword(label: string): string {
  switch (label) {
    case 'Cl/Br':
      return 'chlor';
    case 'pH':
      return 'ph';
    case 'TA':
      return 'alkal';
    case 'CAL':
      return 'calcium';
    case 'STAB':
      return 'stabil';
    case 'SALT':
      return 'salt';
    default:
      return normalize(label);
  }
}

function maintenanceTemplate(template: MaintenanceRecordTemplate | undefined, serviceName: string): MaintenanceRecordTemplate {
  if (template?.enabled) {
    return {
      enabled: true,
      title: template.title || 'Maintenance record',
      callTypes: template.callTypes ?? [],
      checks: template.checks ?? [],
      measurements: template.measurements ?? [],
      chemicals: template.chemicals ?? [],
      deliveries: template.deliveries ?? [],
      noteLabel: template.noteLabel || 'Client note'
    };
  }
  const normalizedService = normalize(serviceName);
  if (normalizedService.includes('pool') || normalizedService.includes('chemical') || normalizedService.includes('chlorine')) {
    return POOL_TEMPLATE;
  }
  return EMPTY_TEMPLATE;
}

function tenantBrand(settings?: TenantSettingsRecord | null): { name: string; legalName: string; address: string; contact: string; logoUrl: string } {
  const name = firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Property Services');
  const legalName = firstNonBlank(settings?.legalName);
  const contact = [settings?.phone, settings?.supportEmail, settings?.websiteUrl].filter(Boolean).join(' | ');
  return {
    name,
    legalName: legalName && !sameText(name, legalName) ? legalName : '',
    address: joinText(', ', settings?.addressLine1, settings?.city, settings?.provinceCode, settings?.postalCode, settings?.countryCode),
    contact,
    logoUrl: absoluteAssetUrl(settings?.logoUrl || '')
  };
}

function absoluteAssetUrl(value: string): string {
  if (!value) {
    return '';
  }
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function formatDateOnly(value?: string): string {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleDateString([], { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' });
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'PS';
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim())?.trim() || '';
}

function joinText(delimiter: string, ...values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join(delimiter);
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = normalizeCompanyName(left);
  const normalizedRight = normalizeCompanyName(right);
  return !!normalizedLeft && !!normalizedRight && (
    normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft)
  );
}

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
