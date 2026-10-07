package com.lorne.platform.finance.internal.service;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.finance.internal.dto.InvoiceDto;
import com.lorne.platform.tenant.TenantSettingsView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Service;

@Service
public class InvoicePdfService {
    private static final float MARGIN = 42;
    private static final float PAGE_WIDTH = PDRectangle.LETTER.getWidth();
    private static final float PAGE_HEIGHT = PDRectangle.LETTER.getHeight();
    private static final PDType1Font FONT = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private final DocumentStorageService documentStorageService;

    public InvoicePdfService(DocumentStorageService documentStorageService) {
        this.documentStorageService = documentStorageService;
    }

    public byte[] generate(InvoiceDto invoice) {
        return generate(invoice, null, null);
    }

    public byte[] generate(InvoiceDto invoice, UUID tenantId, TenantSettingsView settings) {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var logo = logoBytes(tenantId, settings);
            var brand = settings == null ? Brand.defaults() : Brand.from(settings, logo.orElse(null));
            var writer = new PdfWriter(document, brand);
            writer.page();
            writer.header(invoice);
            writer.summary(invoice);
            writer.lineItems(invoice);
            writer.totals(invoice);
            writer.payments(invoice);
            writer.close();
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Invoice PDF could not be generated.", exception);
        }
    }

    private Optional<byte[]> logoBytes(UUID tenantId, TenantSettingsView settings) {
        if (tenantId == null || settings == null || settings.logoUrl() == null || settings.logoUrl().isBlank()) {
            return Optional.empty();
        }
        var documentId = logoDocumentId(settings.logoUrl());
        if (documentId.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(documentStorageService.tenantLogo(tenantId, documentId.get()).bytes());
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private Optional<UUID> logoDocumentId(String logoUrl) {
        var marker = "/api/v1/tenant/settings/logo/";
        var markerIndex = logoUrl.indexOf(marker);
        if (markerIndex < 0) {
            return Optional.empty();
        }
        var id = logoUrl.substring(markerIndex + marker.length()).split("[?#]", 2)[0];
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private static String quantity(BigDecimal value) {
        return value == null ? "0" : value.stripTrailingZeros().toPlainString();
    }

    private static String money(BigDecimal value) {
        var amount = value == null ? BigDecimal.ZERO : value;
        return "$" + amount.setScale(2, RoundingMode.HALF_UP);
    }

    private record Brand(
            String name,
            String legalName,
            String billingEmail,
            String supportEmail,
            String phone,
            String website,
            String address,
            String taxRegistrationNumber,
            BigDecimal invoiceTaxRate,
            String provinceCode,
            String paymentTerms,
            String footer,
            byte[] logoBytes,
            Color primary,
            Color accent,
            ZoneId zoneId,
            boolean showCompanyName,
            boolean showCompanyAddress
    ) {
        private static Brand defaults() {
            return new Brand("Lorne PropertyOps", "", "", "", "", "", "", "", BigDecimal.ZERO, "", "Payment due by the invoice due date.", "Thank you for your business.", null, Color.fromHex("#0f766e"), Color.fromHex("#2563eb"), ZoneId.of("America/Toronto"), false, false);
        }

        private static Brand from(TenantSettingsView settings, byte[] logoBytes) {
            var name = settings.invoiceBrandName();
            var legalName = value(settings.legalName());
            return new Brand(
                    name,
                    sameCompanyName(name, legalName) ? "" : legalName,
                    settings.effectiveBillingEmail(""),
                    settings.effectiveSupportEmail(""),
                    value(settings.phone()),
                    value(settings.websiteUrl()),
                    address(settings),
                    value(settings.taxRegistrationNumber()),
                    settings.invoiceTaxRate() == null ? BigDecimal.ZERO : settings.invoiceTaxRate(),
                    value(settings.provinceCode()),
                    firstNonBlank(settings.paymentTerms(), "Payment due by the invoice due date."),
                    firstNonBlank(settings.invoiceFooter(), "Thank you for your business."),
                    logoBytes,
                    Color.fromHex(settings.themePrimaryColor()),
                    Color.fromHex(settings.themeAccentColor()),
                    InvoicePdfService.zoneId(settings.timezone()),
                    settings.invoiceShowCompanyName(),
                    settings.invoiceShowCompanyAddress()
            );
        }

        private String taxLabel() {
            if (invoiceTaxRate == null || invoiceTaxRate.signum() <= 0) {
                return "Tax";
            }
            var percent = invoiceTaxRate.multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
            var region = provinceCode.isBlank() ? "" : " (" + provinceCode + ")";
            return "HST" + region + " " + percent.toPlainString() + "%";
        }

        private static String address(TenantSettingsView settings) {
            if (join("", settings.addressLine1(), settings.addressLine2(), settings.city(), settings.provinceCode(), settings.postalCode()).isBlank()) {
                return "";
            }
            return join(", ", settings.addressLine1(), settings.addressLine2(), settings.city(), settings.provinceCode(), settings.postalCode(), settings.countryCode());
        }
    }

    private record Color(float red, float green, float blue) {
        private static Color fromHex(String value) {
            var hex = value == null || !value.matches("^#[0-9A-Fa-f]{6}$") ? "#0f766e" : value;
            return new Color(
                    Integer.parseInt(hex.substring(1, 3), 16) / 255f,
                    Integer.parseInt(hex.substring(3, 5), 16) / 255f,
                    Integer.parseInt(hex.substring(5, 7), 16) / 255f
            );
        }
    }

    private static final class PdfWriter {
        private final PDDocument document;
        private final Brand brand;
        private PDPageContentStream content;
        private float y;
        private int pageNumber;

        private PdfWriter(PDDocument document, Brand brand) {
            this.document = document;
            this.brand = brand;
        }

        private void page() throws IOException {
            if (content != null) {
                footer();
                content.close();
            }
            var page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            content = new PDPageContentStream(document, page);
            y = PAGE_HEIGHT - MARGIN;
            pageNumber++;
        }

        private void close() throws IOException {
            if (content != null) {
                footer();
                content.close();
            }
        }

        private void ensure(float requiredHeight) throws IOException {
            if (y - requiredHeight < 70) {
                page();
            }
        }

        private void header(InvoiceDto invoice) throws IOException {
            fill(brand.primary());
            content.addRect(0, PAGE_HEIGHT - 22, PAGE_WIDTH, 22);
            content.fill();
            content.addRect(0, 0, PAGE_WIDTH, 16);
            content.fill();
            fill(0.03f, 0.05f, 0.12f);
            rightTextAt("INVOICE", BOLD, 22, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 82);
            logoStamp(MARGIN + 28, PAGE_HEIGHT - 84, 28);
            if (brand.showCompanyName()) {
                fill(brand.primary());
                textAt(brand.name(), BOLD, 14, MARGIN + 68, PAGE_HEIGHT - 77);
            }
            if (brand.showCompanyAddress() && !brand.address().isBlank()) {
                fill(0.35f, 0.42f, 0.52f);
                textAt(brand.address(), FONT, 8, MARGIN + 68, brand.showCompanyName() ? PAGE_HEIGHT - 91 : PAGE_HEIGHT - 82);
            }
            y = PAGE_HEIGHT - 146;
        }

        private void summary(InvoiceDto invoice) throws IOException {
            var gutter = 22f;
            var leftWidth = 154f;
            var middleWidth = 178f;
            var rightWidth = PAGE_WIDTH - (MARGIN * 2) - leftWidth - middleWidth - (gutter * 2);
            var leftX = MARGIN;
            var middleX = leftX + leftWidth + gutter;
            var rightX = middleX + middleWidth + gutter;
            column(leftX, y, leftWidth, "Bill from", new String[] {
                    brand.legalName(),
                    brand.address(),
                    firstNonBlank(brand.billingEmail(), brand.supportEmail())
            });
            column(middleX, y, middleWidth, "Invoice to", new String[] {
                    value(invoice.ownerName()),
                    firstNonBlank(invoice.ownerBillingEmail(), invoice.ownerEmail()),
                    value(invoice.ownerAddress())
            });
            meta(rightX, y, rightWidth, "Invoice number", invoice.invoiceNumber());
            meta(rightX, y - 22, rightWidth, "Date of invoice", value(invoice.issuedOn()));
            meta(rightX, y - 44, rightWidth, "Due date", value(invoice.dueOn()));
            if (!brand.taxRegistrationNumber().isBlank()) {
                meta(rightX, y - 66, rightWidth, "GST/HST number", brand.taxRegistrationNumber());
            }
            stroke(0.84f, 0.88f, 0.94f);
            line(MARGIN, y - 90, PAGE_WIDTH - MARGIN, y - 90);
            y -= 110;
            workSummaryPanel(invoice);
        }

        private void workSummaryPanel(InvoiceDto invoice) throws IOException {
            var codeLines = wrap(codeSummary(invoice), 96);
            var extraCodeHeight = Math.max(0, codeLines.length - 1) * 10f;
            ensure(86 + extraCodeHeight);
            var width = PAGE_WIDTH - (MARGIN * 2);
            var height = 76f + extraCodeHeight;
            fill(0.97f, 0.99f, 0.99f);
            content.addRect(MARGIN, y - height, width, height);
            content.fill();
            fill(brand.primary());
            content.addRect(MARGIN, y - height, 4, height);
            content.fill();
            stroke(0.84f, 0.88f, 0.94f);
            rect(MARGIN, y - height, width, height);
            fill(brand.primary());
            textAt("PROPERTY AND WORK ORDER", BOLD, 8f, MARGIN + 12, y - 14);
            fill(0.05f, 0.09f, 0.16f);
            textAt(workSummaryTitle(invoice), BOLD, 11f, MARGIN + 12, y - 31);
            fill(0.35f, 0.42f, 0.52f);
            textAt(workNumberSummary(invoice), FONT, 8.3f, MARGIN + 12, y - 45);
            textAt(propertySummary(invoice), FONT, 8.3f, MARGIN + 12, y - 58);
            var lineY = y - 72;
            for (var codeLine : codeLines) {
                fill(brand.primary());
                textAt(codeLine, BOLD, 7.5f, MARGIN + 12, lineY);
                lineY -= 10;
            }
            y -= height + 18;
        }

        private void lineItems(InvoiceDto invoice) throws IOException {
            ensure(70);
            if (invoice.lines().isEmpty()) {
                tableHeader();
                emptyTableRow("No line items have been added.");
                blankTableRow();
                blankTableRow();
                blankTableRow();
                blankTableRow();
                blankTableRow();
                return;
            }
            var grouped = groupedLines(invoice);
            for (var group : grouped) {
                workOrderGroupHeader(group.title(), group.subtitle());
                tableHeader();
                for (var line : group.lines()) {
                    tableRow(line, group.serviceName());
                }
            }
        }

        private List<LineGroup> groupedLines(InvoiceDto invoice) {
            var workOrders = invoice.workOrders() == null
                    ? List.<InvoiceDto.InvoiceWorkOrderDto>of()
                    : invoice.workOrders();
            var workOrderMap = new java.util.LinkedHashMap<UUID, InvoiceDto.InvoiceWorkOrderDto>();
            var groupedLines = new java.util.LinkedHashMap<UUID, java.util.List<InvoiceDto.InvoiceLineDto>>();
            for (var workOrder : workOrders) {
                workOrderMap.put(workOrder.workOrderId(), workOrder);
                groupedLines.put(workOrder.workOrderId(), new java.util.ArrayList<>());
            }
            var additional = new java.util.ArrayList<InvoiceDto.InvoiceLineDto>();
            for (var line : invoice.lines()) {
                if (line.workOrderId() != null && groupedLines.containsKey(line.workOrderId())) {
                    groupedLines.get(line.workOrderId()).add(line);
                } else {
                    additional.add(line);
                }
            }
            var groups = new java.util.ArrayList<LineGroup>();
            for (var entry : groupedLines.entrySet()) {
                if (entry.getValue().isEmpty()) {
                    continue;
                }
                var workOrder = workOrderMap.get(entry.getKey());
                groups.add(new LineGroup(
                        join(" | ", workOrder.workOrderNumber(), firstNonBlank(workOrder.serviceName(), workOrder.title())),
                        join(" | ", label("Property ID", workOrder.propertyCode()), serviceWindow(workOrder)),
                        firstNonBlank(workOrder.serviceName(), workOrder.title()),
                        entry.getValue()
                ));
            }
            if (!additional.isEmpty()) {
                groups.add(new LineGroup("Additional charges", "Manual invoice lines not tied to a work order.", "", additional));
            }
            return groups.isEmpty() ? List.of(new LineGroup(workSummary(invoice), propertySummary(invoice), firstNonBlank(invoice.workOrderTitle(), invoice.propertyName()), invoice.lines())) : groups;
        }

        private void workOrderGroupHeader(String title, String subtitle) throws IOException {
            ensure(52);
            y -= 4;
            var height = 42f;
            fill(0.93f, 0.97f, 0.96f);
            content.addRect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            content.fill();
            fill(brand.primary());
            content.addRect(MARGIN, y - height, 4, height);
            content.fill();
            stroke(0.84f, 0.88f, 0.94f);
            rect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            fill(brand.primary());
            textAt(title, BOLD, 9.5f, MARGIN + 10, y - 16);
            fill(0.26f, 0.34f, 0.44f);
            textAt(subtitle, FONT, 8f, MARGIN + 10, y - 31);
            y -= height;
        }

        private String serviceWindow(InvoiceDto.InvoiceWorkOrderDto workOrder) {
            if (workOrder.scheduledStart() == null) {
                return "";
            }
            var formatter = DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a", Locale.US).withZone(brand.zoneId());
            var start = formatter.format(workOrder.scheduledStart());
            if (workOrder.scheduledEnd() == null) {
                return "Service: " + start;
            }
            return "Service: " + start + " - " + formatter.format(workOrder.scheduledEnd());
        }

        private void totals(InvoiceDto invoice) throws IOException {
            ensure(140);
            y -= 14;
            var boxWidth = 210f;
            var x = PAGE_WIDTH - MARGIN - boxWidth;
            var top = y;
            var height = 128f;
            fill(0.98f, 0.99f, 1f);
            content.addRect(x, top - height, boxWidth, height);
            content.fill();
            stroke(0.84f, 0.88f, 0.94f);
            rect(x, top - height, boxWidth, height);
            var rowY = top - 18;
            totalRow(x + 14, rowY, "Subtotal", money(invoice.subtotal()), false);
            rowY -= 18;
            totalRow(
                    x + 14,
                    rowY,
                    brand.taxLabel(),
                    money(invoice.taxTotal()),
                    false
            );
            rowY -= 12;
            stroke(0.84f, 0.88f, 0.94f);
            line(x + 14, rowY, x + boxWidth - 14, rowY);
            rowY -= 20;
            totalRow(x + 14, rowY, "Total", money(invoice.total()), true);
            rowY -= 20;
            totalRow(x + 14, rowY, "Paid", money(invoice.paidTotal()), false);
            rowY -= 22;
            fill(0.93f, 0.98f, 0.96f);
            content.addRect(x + 10, rowY - 11, boxWidth - 20, 24);
            content.fill();
            fill(0.03f, 0.05f, 0.12f);
            textAt("Balance due", BOLD, 10.5f, x + 20, rowY - 3);
            textAt(money(invoice.balanceDue()), BOLD, 10.5f, x + 126, rowY - 3);

            notesPanel(MARGIN, top, PAGE_WIDTH - (MARGIN * 2) - boxWidth - 20, height);
            y = top - height - 20;
        }

        private void payments(InvoiceDto invoice) throws IOException {
            if (invoice.payments().isEmpty()) {
                return;
            }
            ensure(64);
            sectionTitle("Payments");
            tableHeader("Date", "Method", "Reference", "Amount");
            for (var payment : invoice.payments()) {
                ensure(28);
                rowBox(24);
                textAt(value(payment.paidAt()), FONT, 8.5f, MARGIN + 8, y - 15);
                textAt(value(payment.paymentMethod()), FONT, 8.5f, MARGIN + 160, y - 15);
                textAt(value(payment.reference()), FONT, 8.5f, MARGIN + 280, y - 15);
                textAt(money(payment.amount()), BOLD, 8.5f, PAGE_WIDTH - 108, y - 15);
                y -= 24;
            }
        }

        private void column(float x, float top, float width, String title, String[] lines) throws IOException {
            fill(brand.primary());
            textAt(title.toUpperCase(), BOLD, 8, x, top);
            fill(0.05f, 0.09f, 0.16f);
            var lineY = top - 14;
            var maxChars = Math.max(26, Math.round(width / 6.2f));
            for (var line : lines) {
                for (var wrapped : wrap(line, maxChars)) {
                    if (!wrapped.isBlank()) {
                        textAt(wrapped, FONT, 8.5f, x, lineY);
                        lineY -= 11;
                    }
                }
            }
        }

        private void meta(float x, float y, float width, String label, String value) throws IOException {
            fill(brand.primary());
            rightTextAt(label, BOLD, 7.5f, x + width, y);
            fill(0.05f, 0.09f, 0.16f);
            rightTextAt(value, BOLD, 8.5f, x + width, y - 11);
        }

        private void notesPanel(float x, float top, float width, float height) throws IOException {
            fill(1f, 1f, 1f);
            content.addRect(x, top - height, width, height);
            content.fill();
            stroke(0.86f, 0.90f, 0.95f);
            rect(x, top - height, width, height);
            fill(brand.primary());
            textAt("NOTES", BOLD, 8, x + 12, top - 18);
            fill(0.22f, 0.29f, 0.39f);
            textAt(brand.footer(), FONT, 8.5f, x + 12, top - 33);
            fill(brand.primary());
            textAt("TERMS AND CONDITIONS", BOLD, 8, x + 12, top - 64);
            fill(0.22f, 0.29f, 0.39f);
            var lineY = top - 79;
            for (var line : wrap(brand.paymentTerms(), Math.max(40, Math.round(width / 5.3f)))) {
                textAt(line, FONT, 8.5f, x + 12, lineY);
                lineY -= 11;
            }
        }

        private void sectionTitle(String title) throws IOException {
            ensure(28);
            fill(brand.primary());
            textAt(title.toUpperCase(), BOLD, 8.5f, MARGIN, y);
            y -= 18;
        }

        private void tableHeader() throws IOException {
            ensure(32);
            fill(brand.primary());
            content.addRect(MARGIN, y - 20, PAGE_WIDTH - (MARGIN * 2), 20);
            content.fill();
            fill(1f, 1f, 1f);
            centerTextAt("QTY", BOLD, 7.5f, MARGIN + 26, y - 13);
            textAt("DESCRIPTION", BOLD, 7.5f, MARGIN + 60, y - 13);
            centerTextAt("RATE", BOLD, 7.5f, PAGE_WIDTH - 156, y - 13);
            rightTextAt("AMOUNT", BOLD, 7.5f, PAGE_WIDTH - MARGIN - 8, y - 13);
            y -= 20;
        }

        private void tableHeader(String first, String second, String third, String fourth) throws IOException {
            ensure(32);
            fill(brand.primary());
            content.addRect(MARGIN, y - 20, PAGE_WIDTH - (MARGIN * 2), 20);
            content.fill();
            fill(1f, 1f, 1f);
            textAt(first.toUpperCase(), BOLD, 7.5f, MARGIN + 8, y - 13);
            centerTextAt(second.toUpperCase(), BOLD, 7.5f, PAGE_WIDTH - 222, y - 13);
            centerTextAt(third.toUpperCase(), BOLD, 7.5f, PAGE_WIDTH - 156, y - 13);
            rightTextAt(fourth.toUpperCase(), BOLD, 7.5f, PAGE_WIDTH - MARGIN - 8, y - 13);
            y -= 20;
        }

        private void tableRow(InvoiceDto.InvoiceLineDto line, String serviceName) throws IOException {
            var wrapped = wrap(line.description(), 66);
            var material = "MATERIAL".equalsIgnoreCase(value(line.lineType()));
            var rowHeight = Math.max(40, wrapped.length * 11 + 28);
            ensure(rowHeight + 8);
            invoiceRowBox(rowHeight, material);
            fill(material ? brand.accent() : brand.primary());
            content.addRect(MARGIN, y - rowHeight, 3, rowHeight);
            content.fill();
            fill(material ? brand.accent() : brand.primary());
            textAt(lineTypeLabel(line, serviceName), BOLD, 7.3f, MARGIN + 62, y - 13);
            var lineY = y - 27;
            fill(0.05f, 0.09f, 0.16f);
            for (var text : wrapped) {
                textAt(text, FONT, 8.5f, MARGIN + 62, lineY);
                lineY -= 11;
            }
            fill(0.05f, 0.09f, 0.16f);
            centerTextAt(quantity(line.quantity()), FONT, 8.5f, MARGIN + 26, y - 13);
            rightTextAt(money(line.unitPrice()), FONT, 8.5f, PAGE_WIDTH - 126, y - 13);
            rightTextAt(money(line.lineTotal()), BOLD, 8.5f, PAGE_WIDTH - MARGIN - 8, y - 13);
            y -= rowHeight;
        }

        private void emptyTableRow(String message) throws IOException {
            ensure(38);
            invoiceRowBox(28, false);
            fill(0.35f, 0.42f, 0.52f);
            textAt(message, FONT, 8.5f, MARGIN + 8, y - 17);
            y -= 28;
        }

        private void blankTableRow() throws IOException {
            ensure(24);
            invoiceRowBox(22, false);
            y -= 22;
        }

        private void invoiceRowBox(float height, boolean shaded) throws IOException {
            fill(shaded ? 0.90f : 1f, shaded ? 0.92f : 1f, shaded ? 0.95f : 1f);
            content.addRect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            content.fill();
            stroke(0.88f, 0.91f, 0.95f);
            rect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            line(MARGIN + 52, y, MARGIN + 52, y - height);
            line(PAGE_WIDTH - 196, y, PAGE_WIDTH - 196, y - height);
            line(PAGE_WIDTH - 116, y, PAGE_WIDTH - 116, y - height);
        }

        private void rowBox(float height) throws IOException {
            rowBox(height, false);
        }

        private void rowBox(float height, boolean shaded) throws IOException {
            fill(shaded ? 0.90f : 1f, shaded ? 0.92f : 1f, shaded ? 0.95f : 1f);
            content.addRect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            content.fill();
            stroke(0.88f, 0.91f, 0.95f);
            rect(MARGIN, y - height, PAGE_WIDTH - (MARGIN * 2), height);
            line(PAGE_WIDTH - 248, y, PAGE_WIDTH - 248, y - height);
            line(PAGE_WIDTH - 196, y, PAGE_WIDTH - 196, y - height);
            line(PAGE_WIDTH - 116, y, PAGE_WIDTH - 116, y - height);
        }

        private void totalRow(float x, float rowY, String label, String value, boolean strong) throws IOException {
            fill(strong ? 0.03f : 0.35f, strong ? 0.05f : 0.42f, strong ? 0.12f : 0.52f);
            textAt(label, strong ? BOLD : FONT, strong ? 11 : 9, x, rowY);
            fill(0.05f, 0.09f, 0.16f);
            textAt(value, BOLD, strong ? 11 : 9, x + 126, rowY);
        }

        private void badge(String label, float x, float y, float width, float height, Color color) throws IOException {
            fill(0.93f, 0.98f, 0.96f);
            content.addRect(x, y, width, height);
            content.fill();
            stroke(color);
            rect(x, y, width, height);
            fill(color);
            textAt(label.toUpperCase(), BOLD, 8.5f, x + 10, y + 7);
        }

        private void logoStamp(float centerX, float centerY, float radius) throws IOException {
            var boxSize = radius * 2;
            fill(1f, 1f, 1f);
            content.addRect(centerX - radius, centerY - radius, boxSize, boxSize);
            content.fill();
            stroke(0.80f, 0.84f, 0.90f);
            rect(centerX - radius, centerY - radius, boxSize, boxSize);
            if (brand.logoBytes() != null && brand.logoBytes().length > 0) {
                try {
                    var image = PDImageXObject.createFromByteArray(document, brand.logoBytes(), "tenant-logo");
                    var maxSize = boxSize - 8;
                    var scale = Math.min(maxSize / image.getWidth(), maxSize / image.getHeight());
                    var width = image.getWidth() * scale;
                    var height = image.getHeight() * scale;
                    content.drawImage(image, centerX - (width / 2), centerY - (height / 2), width, height);
                    return;
                } catch (IOException | RuntimeException exception) {
                    // Keep invoice generation resilient if a tenant uploads an image type PDFBox cannot embed.
                }
            }
            fill(brand.primary());
            centerTextAt(initials(brand.name()), BOLD, 8, centerX, centerY - 3);
        }

        private void footer() throws IOException {
            stroke(0.88f, 0.91f, 0.95f);
            line(MARGIN, 44, PAGE_WIDTH - MARGIN, 44);
            fill(0.45f, 0.52f, 0.63f);
            textAt(join(" | ", brand.name(), brand.supportEmail(), brand.website()), FONT, 7.5f, MARGIN, 30);
            textAt("Page " + pageNumber, FONT, 7.5f, PAGE_WIDTH - 72, 30);
        }

        private void textAt(String value, PDType1Font font, float size, float x, float y) throws IOException {
            if (value == null || value.isBlank()) {
                return;
            }
            content.beginText();
            content.setFont(font, size);
            content.newLineAtOffset(x, y);
            content.showText(clean(value));
            content.endText();
        }

        private void rightTextAt(String value, PDType1Font font, float size, float rightX, float y) throws IOException {
            textAt(value, font, size, rightX - textWidth(value, font, size), y);
        }

        private void centerTextAt(String value, PDType1Font font, float size, float y) throws IOException {
            centerTextAt(value, font, size, PAGE_WIDTH / 2, y);
        }

        private void centerTextAt(String value, PDType1Font font, float size, float centerX, float y) throws IOException {
            textAt(value, font, size, centerX - (textWidth(value, font, size) / 2), y);
        }

        private float textWidth(String value, PDType1Font font, float size) throws IOException {
            return font.getStringWidth(clean(value)) / 1000f * size;
        }

        private void rect(float x, float y, float width, float height) throws IOException {
            content.setLineWidth(0.7f);
            content.addRect(x, y, width, height);
            content.stroke();
        }

        private void line(float x1, float y1, float x2, float y2) throws IOException {
            content.setLineWidth(0.7f);
            content.moveTo(x1, y1);
            content.lineTo(x2, y2);
            content.stroke();
        }

        private void fill(Color color) throws IOException {
            fill(color.red(), color.green(), color.blue());
        }

        private void stroke(Color color) throws IOException {
            stroke(color.red(), color.green(), color.blue());
        }

        private void fill(float red, float green, float blue) throws IOException {
            content.setNonStrokingColor(red, green, blue);
        }

        private void stroke(float red, float green, float blue) throws IOException {
            content.setStrokingColor(red, green, blue);
        }

        private String[] wrap(String value, int maxChars) {
            var words = clean(value).split("\\s+");
            var lines = new java.util.ArrayList<String>();
            var line = new StringBuilder();
            for (var word : words) {
                if (line.length() + word.length() + 1 > maxChars && !line.isEmpty()) {
                    lines.add(line.toString());
                    line = new StringBuilder();
                }
                if (!line.isEmpty()) {
                    line.append(' ');
                }
                line.append(word);
            }
            if (!line.isEmpty()) {
                lines.add(line.toString());
            }
            return lines.isEmpty() ? new String[] { "" } : lines.toArray(String[]::new);
        }

        private String clean(String value) {
            return value == null ? "" : value.replaceAll("[\\r\\n\\t]+", " ").replaceAll("[^\\x20-\\x7E]", "").trim();
        }

        private String initials(String value) {
            var cleanValue = clean(value);
            if (cleanValue.isBlank()) {
                return "LOGO";
            }
            var builder = new StringBuilder();
            for (var word : cleanValue.split("\\s+")) {
                if (!word.isBlank()) {
                    builder.append(Character.toUpperCase(word.charAt(0)));
                }
                if (builder.length() == 2) {
                    break;
                }
            }
            return builder.isEmpty() ? "LOGO" : builder.toString();
        }

        private String lineTypeLabel(InvoiceDto.InvoiceLineDto line, String serviceName) {
            var type = value(line.lineType()).toUpperCase(Locale.ROOT);
            if ("LABOR".equals(type) && serviceName != null && !serviceName.isBlank()) {
                return "LABOR - " + clean(serviceName);
            }
            return typeLabel(line.lineType()).toUpperCase(Locale.ROOT);
        }

        private record LineGroup(String title, String subtitle, String serviceName, List<InvoiceDto.InvoiceLineDto> lines) {
        }
    }

    private static String typeLabel(String value) {
        return value == null ? "Line item" : value.toLowerCase().replace('_', ' ');
    }

    private static String status(String value) {
        return value == null ? "" : value.toLowerCase().replace('_', ' ');
    }

    private static String value(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static boolean sameCompanyName(String left, String right) {
        var normalizedLeft = normalizeCompanyName(left);
        var normalizedRight = normalizeCompanyName(right);
        return !normalizedLeft.isBlank()
                && !normalizedRight.isBlank()
                && (normalizedLeft.equals(normalizedRight)
                || normalizedLeft.startsWith(normalizedRight)
                || normalizedRight.startsWith(normalizedLeft));
    }

    private static String normalizeCompanyName(String value) {
        return value == null
                ? ""
                : value.toLowerCase(Locale.ROOT)
                        .replaceAll("\\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co)\\b", "")
                        .replaceAll("[^a-z0-9]", "");
    }

    private static String workSummary(InvoiceDto invoice) {
        var numbers = workNumberSummary(invoice);
        var title = workSummaryTitle(invoice);
        return join(" | ", title, numbers);
    }

    private static String workSummaryTitle(InvoiceDto invoice) {
        var workOrders = invoice.workOrders() == null
                ? List.<InvoiceDto.InvoiceWorkOrderDto>of()
                : invoice.workOrders();
        if (workOrders.size() <= 1) {
            return firstNonBlank(invoice.workOrderTitle(), "Single work order");
        }
        return "%d work orders included".formatted(workOrders.size());
    }

    private static String workNumberSummary(InvoiceDto invoice) {
        var workOrders = invoice.workOrders() == null
                ? List.<InvoiceDto.InvoiceWorkOrderDto>of()
                : invoice.workOrders();
        if (workOrders.size() <= 1) {
            return value(invoice.workOrderNumber());
        }
        var numbers = workOrders.stream()
                .map(InvoiceDto.InvoiceWorkOrderDto::workOrderNumber)
                .filter(value -> value != null && !value.isBlank())
                .limit(4)
                .toList();
        var suffix = workOrders.size() > 4 ? " +" + (workOrders.size() - 4) + " more" : "";
        return numbers.isEmpty() ? "" : String.join(", ", numbers) + suffix;
    }

    private static String propertySummary(InvoiceDto invoice) {
        var workOrders = invoice.workOrders() == null
                ? List.<InvoiceDto.InvoiceWorkOrderDto>of()
                : invoice.workOrders();
        if (workOrders.size() <= 1) {
            return "";
        }
        var propertyNames = workOrders.stream()
                .map(InvoiceDto.InvoiceWorkOrderDto::propertyName)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .toList();
        if (propertyNames.size() == 1) {
            return propertyNames.getFirst();
        }
        return "%d properties included".formatted(propertyNames.size());
    }

    private static String codeSummary(InvoiceDto invoice) {
        return join(" | ", label("Owner ID", invoice.ownerCode()), label(propertyCodeLabel(invoice), propertyCodeSummary(invoice)));
    }

    private static String propertyCodeLabel(InvoiceDto invoice) {
        return propertyCodes(invoice).size() > 1 ? "Property IDs" : "Property ID";
    }

    private static String propertyCodeSummary(InvoiceDto invoice) {
        var codes = propertyCodes(invoice);
        if (codes.isEmpty()) {
            return value(invoice.propertyCode());
        }
        return String.join(", ", codes);
    }

    private static List<String> propertyCodes(InvoiceDto invoice) {
        var workOrders = invoice.workOrders() == null
                ? List.<InvoiceDto.InvoiceWorkOrderDto>of()
                : invoice.workOrders();
        var codes = workOrders.stream()
                .map(InvoiceDto.InvoiceWorkOrderDto::propertyCode)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .toList();
        if (codes.isEmpty() && invoice.propertyCode() != null && !invoice.propertyCode().isBlank()) {
            return List.of(invoice.propertyCode());
        }
        return codes;
    }

    private static String label(String label, String value) {
        return value == null || value.isBlank() ? "" : label + ": " + value.trim();
    }

    private static String join(String delimiter, String... values) {
        var builder = new StringBuilder();
        for (var value : values) {
            if (value == null || value.isBlank()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(delimiter);
            }
            builder.append(value.trim());
        }
        return builder.toString();
    }

    private static ZoneId zoneId(String value) {
        try {
            return value == null || value.isBlank() ? ZoneId.of("America/Toronto") : ZoneId.of(value.trim());
        } catch (RuntimeException exception) {
            return ZoneId.of("America/Toronto");
        }
    }
}
