package com.lorne.platform.quote.internal.service;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.quote.internal.dto.QuoteDto;
import com.lorne.platform.tenant.TenantSettingsView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
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
public class QuotePdfService {
    private static final PDType1Font REGULAR = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private final DocumentStorageService storage;

    public QuotePdfService(DocumentStorageService storage) { this.storage = storage; }

    public byte[] generate(QuoteDto quote, UUID tenantId, TenantSettingsView settings) {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            document.getDocumentInformation().setTitle("Quote " + quote.quoteNumber());
            var writer = new Writer(document, quote, settings);
            writer.page();
            writer.header(logo(tenantId, settings));
            writer.parties();
            if (quote.scope() != null) writer.section("DESCRIPTION (SCOPE OF WORK)", quote.scope());
            writer.table();
            writer.summary();
            if (quote.approvedAt() != null) {
                writer.section("CLIENT APPROVAL", "Approved by " + quote.approvalName() + " on " + writer.approvalDate());
                writer.paragraph(quote.approvalComment(), false);
            }
            writer.terms();
            writer.close();
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Quote PDF could not be generated.", exception);
        }
    }

    private byte[] logo(UUID tenantId, TenantSettingsView settings) {
        if (storage == null || settings == null || settings.logoUrl() == null) return null;
        var marker = "/api/v1/tenant/settings/logo/";
        var index = settings.logoUrl().indexOf(marker);
        if (index < 0) return null;
        try {
            var id = UUID.fromString(settings.logoUrl().substring(index + marker.length()).split("[?#]", 2)[0]);
            return storage.tenantLogo(tenantId, id).bytes();
        } catch (RuntimeException exception) { return null; }
    }

    private static String join(String... values) {
        return java.util.Arrays.stream(values).filter(value -> value != null && !value.isBlank())
                .collect(java.util.stream.Collectors.joining(" | "));
    }

    private static String money(BigDecimal value) { return "$" + value.setScale(2, RoundingMode.HALF_UP); }

    private static String printable(String value) {
        if (value == null) return "";
        var result = new StringBuilder();
        value.codePoints().forEach(code -> {
            var character = new String(Character.toChars(code));
            if (code == '\n' || code == '\r') { result.append('\n'); return; }
            if (Character.isWhitespace(code)) { result.append(' '); return; }
            try { REGULAR.encode(character); result.append(character); }
            catch (IOException | IllegalArgumentException exception) { result.append('?'); }
        });
        return result.toString();
    }

    private static final class Writer {
        private static final float LEFT = 42, RIGHT = 570, BOTTOM = 72;
        private final PDDocument document;
        private final QuoteDto quote;
        private final TenantSettingsView settings;
        private final java.awt.Color brand;
        private PDPageContentStream stream;
        private float y;
        private int pageNumber;

        Writer(PDDocument document, QuoteDto quote, TenantSettingsView settings) {
            this.document = document; this.quote = quote; this.settings = settings;
            var color = settings == null ? "#0f766e" : settings.themePrimaryColor();
            brand = java.awt.Color.decode(color != null && color.matches("#[0-9A-Fa-f]{6}") ? color : "#0f766e");
        }

        void page() throws IOException {
            if (stream != null) close();
            var page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = 746;
            pageNumber++;
            if (pageNumber > 1) {
                text("QUOTE " + quote.quoteNumber() + " (continued)", LEFT, y, 11, BOLD, brand);
                y -= 25;
            }
        }

        void ensure(float height) throws IOException { if (y - height < BOTTOM) page(); }

        void header(byte[] logo) throws IOException {
            var headerY = y;
            float logoHeight = 0;
            if (logo != null) {
                try {
                    var image = PDImageXObject.createFromByteArray(document, logo, "Company logo");
                    var scale = Math.min(132f / image.getWidth(), 64f / image.getHeight());
                    logoHeight = image.getHeight() * scale;
                    stream.drawImage(image, LEFT, y - logoHeight, image.getWidth() * scale, logoHeight);
                } catch (IOException | RuntimeException ignored) { logoHeight = 0; }
            }
            right("QUOTE", RIGHT - 12, headerY - 8, 28, BOLD, brand);
            right(quote.quoteNumber(), RIGHT - 12, headerY - 34, 11, BOLD);
            metadata("ISSUED", quote.issueDate().format(java.time.format.DateTimeFormatter.ofPattern("MMM d, uuuu", java.util.Locale.CANADA)), headerY - 65);
            metadata("VALID UNTIL", quote.validUntil() == null ? "Not specified" : quote.validUntil().format(java.time.format.DateTimeFormatter.ofPattern("MMM d, uuuu", java.util.Locale.CANADA)), headerY - 87);
            y = headerY - (logoHeight > 0 ? logoHeight + 14 : 8);
            if (logoHeight == 0) {
                paragraph(settings == null ? "Lorne PropertyOps" : settings.invoiceBrandName(), true, 264);
            }
            if (settings != null) {
                for (var addressLine : addressLines()) {
                    for (var part : wrap(addressLine, 264, 9.5f, REGULAR)) {
                        text(part, LEFT, y, 9.5f, REGULAR, java.awt.Color.DARK_GRAY);
                        y -= 14;
                    }
                }
            }
            if (settings != null && settings.taxRegistrationNumber() != null && !settings.taxRegistrationNumber().isBlank()) {
                y -= 5;
                for (var part : wrap("GST/HST number: " + settings.taxRegistrationNumber(), 264, 8.5f, REGULAR)) {
                    text(part, LEFT, y, 8.5f, REGULAR, java.awt.Color.GRAY); y -= 13;
                }
            }
            y = Math.min(y, headerY - 105) - 14;
            rule();
            y -= 28;
        }

        void metadata(String label, String value, float baseline) throws IOException {
            right(label, 480, baseline, 8, BOLD, java.awt.Color.GRAY);
            right(value, RIGHT - 12, baseline, 10, REGULAR);
        }

        List<String> addressLines() {
            var lines = new ArrayList<String>();
            var street = java.util.stream.Stream.of(settings.addressLine2(), settings.addressLine1())
                    .filter(value -> value != null && !value.isBlank()).map(String::trim)
                    .collect(java.util.stream.Collectors.joining(", "));
            if (!street.isBlank()) lines.add(street);
            var city = settings.city() == null ? "" : settings.city().trim();
            var province = settings.provinceCode() == null ? "" : settings.provinceCode().trim();
            var locality = city;
            if (!province.isBlank() && !city.equalsIgnoreCase(province)
                    && !city.toUpperCase(java.util.Locale.ROOT).endsWith(", " + province.toUpperCase(java.util.Locale.ROOT))) {
                locality += (city.isBlank() ? "" : ", ") + province;
            }
            if (settings.postalCode() != null && !settings.postalCode().isBlank()) locality += (locality.isBlank() ? "" : "  ") + settings.postalCode().trim().toUpperCase(java.util.Locale.ROOT);
            if (!locality.isBlank()) lines.add(locality);
            if (settings.countryCode() != null && !settings.countryCode().isBlank()) lines.add(settings.countryCode().trim());
            return lines;
        }

        void parties() throws IOException {
            var project = quote.propertyAddress() == null || quote.propertyAddress().isBlank() ? quote.propertyName() : quote.propertyAddress();
            var leftHeight = columnHeight(quote.customerName(), quote.customerEmail(), 244);
            var rightHeight = columnHeight(project, quote.title(), 244);
            var height = Math.max(leftHeight, rightHeight);
            if (height > 600) {
                section("PREPARED FOR", quote.customerName()); paragraph(quote.customerEmail(), false);
                section("PROJECT", project); paragraph(quote.title(), false);
                return;
            }
            ensure(height + 18);
            var top = y;
            var leftEnd = column("PREPARED FOR", quote.customerName(), quote.customerEmail(), LEFT, top, 244);
            var rightEnd = column("PROJECT", project, quote.title(), 326, top, 244);
            y = Math.min(leftEnd, rightEnd) - 14;
        }

        float columnHeight(String primary, String secondary, float width) throws IOException {
            return 24 + wrap(primary, width, 10.5f, BOLD).size() * 15 + wrap(secondary, width, 10, REGULAR).size() * 15;
        }

        float column(String label, String primary, String secondary, float x, float top, float width) throws IOException {
            text(label, x, top, 9, BOLD, brand);
            top -= 21;
            for (var line : wrap(primary, width, 10.5f, BOLD)) { text(line, x, top, 10.5f, BOLD, java.awt.Color.DARK_GRAY); top -= 15; }
            top -= 3;
            for (var line : wrap(secondary, width, 10, REGULAR)) { text(line, x, top, 10, REGULAR, java.awt.Color.DARK_GRAY); top -= 15; }
            return top;
        }

        void section(String label, String value) throws IOException {
            ensure(48);
            y -= 12;
            text(label, LEFT, y, 9, BOLD, brand);
            y -= 19;
            paragraph(value, false);
        }

        void paragraph(String value, boolean bold) throws IOException {
            paragraph(value, bold, RIGHT - LEFT);
        }

        void paragraph(String value, boolean bold, float width) throws IOException {
            if (value == null || value.isBlank()) return;
            for (var line : wrap(value, width, 10.5f, bold ? BOLD : REGULAR)) {
                ensure(16);
                text(line, LEFT, y, 10.5f, bold ? BOLD : REGULAR, java.awt.Color.DARK_GRAY);
                y -= 16;
            }
        }

        void tableHeader() throws IOException {
            stream.setNonStrokingColor(brand);
            stream.addRect(LEFT, y - 24, RIGHT - LEFT, 28);
            stream.fill();
            if ("TOTAL_PRICE".equals(quote.pricingMode())) text("DESCRIPTION", 50, y - 14, 9, BOLD, java.awt.Color.WHITE);
            else {
                text("QTY", 50, y - 14, 9, BOLD, java.awt.Color.WHITE);
                text("DESCRIPTION", 112, y - 14, 9, BOLD, java.awt.Color.WHITE);
                text("RATE", 430, y - 14, 9, BOLD, java.awt.Color.WHITE);
                text("AMOUNT", 510, y - 14, 9, BOLD, java.awt.Color.WHITE);
            }
            y -= 42;
        }

        void table() throws IOException {
            ensure(75); y -= 14; tableHeader();
            var totalPrice = "TOTAL_PRICE".equals(quote.pricingMode());
            for (var line : quote.lines()) {
                var description = wrap(totalPrice ? line.description() : join(line.description(), line.unit()), totalPrice ? 506 : 300, 10, REGULAR);
                boolean first = true;
                for (var part : description) {
                    if (y - 20 < BOTTOM) { page(); tableHeader(); }
                    if (first && !totalPrice) {
                        text(line.quantity().stripTrailingZeros().toPlainString(), 50, y, 10, REGULAR, java.awt.Color.DARK_GRAY);
                        right(money(line.rate()), 483, y, 10, REGULAR);
                        right(money(line.amount()), 562, y, 10, BOLD);
                        first = false;
                    }
                    text(part, totalPrice ? 50 : 112, y, 10, REGULAR, java.awt.Color.DARK_GRAY);
                    y -= 16;
                }
                rule(); y -= 18;
            }
        }

        void summary() throws IOException {
            var notesHeight = summaryHeight(quote.notes());
            var height = Math.max(104, notesHeight);
            if (height > 600) {
                totals();
                if (quote.notes() != null) section("CLIENT NOTES", quote.notes());
                return;
            }
            ensure(height + 20);
            var top = y - 10;
            var leftEnd = summaryText("CLIENT NOTES", quote.notes(), top);
            y = top + 10;
            totals();
            y = Math.min(y, leftEnd) - 12;
        }

        void terms() throws IOException {
            if (quote.terms() == null || quote.terms().isBlank()) return;
            var height = 31 + wrap(quote.terms(), RIGHT - LEFT, 10.5f, REGULAR).size() * 16;
            if (height <= 180) {
                ensure(height + 24);
                y = Math.min(y, BOTTOM + height + 8);
            }
            section("TERMS", quote.terms());
        }

        float summaryHeight(String value) throws IOException {
            return value == null || value.isBlank() ? 0 : 34 + wrap(value, 280, 10, REGULAR).size() * 15;
        }

        float summaryText(String label, String value, float top) throws IOException {
            if (value == null || value.isBlank()) return top;
            text(label, LEFT, top, 9, BOLD, brand); top -= 19;
            for (var line : wrap(value, 280, 10, REGULAR)) { text(line, LEFT, top, 10, REGULAR, java.awt.Color.DARK_GRAY); top -= 15; }
            return top - 15;
        }

        String approvalDate() {
            java.time.ZoneId zone;
            try { zone = java.time.ZoneId.of(settings == null || settings.timezone() == null ? "UTC" : settings.timezone()); }
            catch (java.time.DateTimeException exception) { zone = java.time.ZoneOffset.UTC; }
            return java.time.format.DateTimeFormatter.ofPattern("MMM d, uuuu 'at' h:mm a z", java.util.Locale.CANADA)
                    .withZone(zone).format(quote.approvedAt());
        }

        void totals() throws IOException {
            ensure(100); y -= 10;
            total("Subtotal", money(quote.subtotal()), false);
            total("HST (" + quote.taxRate().multiply(BigDecimal.valueOf(100)).stripTrailingZeros().toPlainString() + "%)", money(quote.taxAmount()), false);
            total("TOTAL (CAD)", money(quote.total()), true);
        }

        void total(String label, String amount, boolean bold) throws IOException {
            if (bold) {
                stream.setNonStrokingColor(new java.awt.Color(242, 245, 248));
                stream.addRect(354, y - 9, RIGHT - 354, 28); stream.fill();
            }
            text(label, 365, y, bold ? 12 : 10, bold ? BOLD : REGULAR, bold ? brand : java.awt.Color.DARK_GRAY);
            right(amount, RIGHT, y, bold ? 12 : 10, bold ? BOLD : REGULAR);
            y -= 23;
        }

        void rule() throws IOException {
            stream.setStrokingColor(new java.awt.Color(218, 226, 232));
            stream.setLineWidth(.6f); stream.moveTo(LEFT, y); stream.lineTo(RIGHT, y); stream.stroke();
        }

        void text(String value, float x, float baseline, float size, PDType1Font font, java.awt.Color color) throws IOException {
            stream.setNonStrokingColor(color); stream.beginText(); stream.setFont(font, size);
            stream.newLineAtOffset(x, baseline); stream.showText(printable(value)); stream.endText();
        }

        void right(String value, float edge, float baseline, float size, PDType1Font font) throws IOException {
            right(value, edge, baseline, size, font, java.awt.Color.DARK_GRAY);
        }

        void right(String value, float edge, float baseline, float size, PDType1Font font, java.awt.Color color) throws IOException {
            text(value, edge - font.getStringWidth(printable(value)) / 1000 * size, baseline, size, font, color);
        }

        List<String> wrap(String value, float width, float size, PDType1Font font) throws IOException {
            var result = new ArrayList<String>();
            for (var paragraph : printable(value).split("\n", -1)) {
                var line = new StringBuilder();
                for (var word : paragraph.split(" +")) {
                    if (word.isEmpty()) continue;
                    if (!line.isEmpty() && font.getStringWidth(line + " " + word) / 1000 * size > width) {
                        result.add(line.toString()); line.setLength(0);
                    }
                    for (int i = 0; i < word.length(); i++) {
                        var candidate = line.toString() + word.charAt(i);
                        if (font.getStringWidth(candidate) / 1000 * size > width && !line.isEmpty()) {
                            result.add(line.toString()); line.setLength(0);
                        }
                        line.append(word.charAt(i));
                    }
                    line.append(' ');
                }
                result.add(line.toString().stripTrailing());
            }
            return result;
        }

        void close() throws IOException {
            stream.setStrokingColor(new java.awt.Color(218, 226, 232)); stream.setLineWidth(.6f);
            stream.moveTo(LEFT, 59); stream.lineTo(RIGHT, 59); stream.stroke();
            var contact = settings == null ? "" : join(settings.websiteUrl(), settings.phone(), settings.effectiveSupportEmail(""));
            float baseline = 43;
            for (var line : wrap(contact, 430, 8, REGULAR)) {
                text(line, LEFT, baseline, 8, REGULAR, java.awt.Color.GRAY); baseline -= 10;
            }
            right("Page " + pageNumber, RIGHT, 43, 8, REGULAR);
            stream.close(); stream = null;
        }
    }
}
