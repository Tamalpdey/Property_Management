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
            writer.section("PREPARED FOR", quote.customerName());
            writer.paragraph(join(quote.customerEmail(), quote.customerPhone()), false);
            writer.paragraph(join(quote.propertyName(), quote.propertyAddress()), false);
            writer.section("QUOTE FOR", quote.title());
            writer.paragraph(quote.serviceName(), false);
            if (quote.scope() != null) writer.section("SCOPE OF WORK", quote.scope());
            writer.table();
            writer.totals();
            if (quote.notes() != null) writer.section("CLIENT NOTES", quote.notes());
            if (quote.terms() != null) writer.section("TERMS", quote.terms());
            if (quote.approvedAt() != null) {
                writer.section("CLIENT APPROVAL", "Approved by " + quote.approvalName() + " on " + quote.approvedAt());
                writer.paragraph(quote.approvalComment(), false);
            }
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
            float logoHeight = 0;
            if (logo != null) {
                try {
                    var image = PDImageXObject.createFromByteArray(document, logo, "Company logo");
                    var scale = Math.min(110f / image.getWidth(), 60f / image.getHeight());
                    logoHeight = image.getHeight() * scale;
                    stream.drawImage(image, LEFT, y - logoHeight, image.getWidth() * scale, logoHeight);
                } catch (IOException | RuntimeException ignored) { logoHeight = 0; }
            }
            text("QUOTE", 438, y - 8, 26, BOLD, brand);
            right(quote.quoteNumber(), RIGHT, y - 30, 11, BOLD);
            y -= Math.max(60, logoHeight + 12);
            if (settings == null || settings.invoiceShowCompanyName()) {
                paragraph(settings == null ? "Lorne PropertyOps" : settings.invoiceBrandName(), true);
            }
            if (settings != null && settings.invoiceShowCompanyAddress()) {
                paragraph(join(settings.addressLine1(), settings.addressLine2(), settings.city(), settings.provinceCode(), settings.postalCode(), settings.countryCode()), false);
            }
            paragraph("Issued: " + quote.issueDate() + (quote.validUntil() == null ? "" : "    Valid until: " + quote.validUntil()), false);
            paragraph("Status: " + quote.status().toLowerCase(java.util.Locale.ROOT), false);
            if (settings != null && settings.taxRegistrationNumber() != null && !settings.taxRegistrationNumber().isBlank()) {
                paragraph("GST/HST number: " + settings.taxRegistrationNumber(), false);
            }
            rule();
        }

        void section(String label, String value) throws IOException {
            ensure(40);
            y -= 8;
            text(label, LEFT, y, 9, BOLD, brand);
            y -= 14;
            paragraph(value, false);
        }

        void paragraph(String value, boolean bold) throws IOException {
            if (value == null || value.isBlank()) return;
            for (var line : wrap(value, RIGHT - LEFT, 10.5f, bold ? BOLD : REGULAR)) {
                ensure(16);
                text(line, LEFT, y, 10.5f, bold ? BOLD : REGULAR, java.awt.Color.DARK_GRAY);
                y -= 16;
            }
        }

        void tableHeader() throws IOException {
            stream.setNonStrokingColor(brand);
            stream.addRect(LEFT, y - 24, RIGHT - LEFT, 28);
            stream.fill();
            text("QTY", 50, y - 14, 9, BOLD, java.awt.Color.WHITE);
            text("DESCRIPTION", 112, y - 14, 9, BOLD, java.awt.Color.WHITE);
            text("RATE", 430, y - 14, 9, BOLD, java.awt.Color.WHITE);
            text("AMOUNT", 510, y - 14, 9, BOLD, java.awt.Color.WHITE);
            y -= 42;
        }

        void table() throws IOException {
            ensure(75); y -= 14; tableHeader();
            for (var line : quote.lines()) {
                var description = wrap(join(line.description(), line.unit()), 300, 10, REGULAR);
                boolean first = true;
                for (var part : description) {
                    if (y - 20 < BOTTOM) { page(); tableHeader(); }
                    if (first) {
                        text(line.quantity().stripTrailingZeros().toPlainString(), 50, y, 10, REGULAR, java.awt.Color.DARK_GRAY);
                        right(money(line.rate()), 483, y, 10, REGULAR);
                        right(money(line.amount()), 562, y, 10, BOLD);
                        first = false;
                    }
                    text(part, 112, y, 10, REGULAR, java.awt.Color.DARK_GRAY);
                    y -= 16;
                }
                y -= 6; rule(); y -= 8;
            }
        }

        void totals() throws IOException {
            ensure(100); y -= 10;
            total("Subtotal", money(quote.subtotal()), false);
            total("Tax (" + quote.taxRate().multiply(BigDecimal.valueOf(100)).stripTrailingZeros().toPlainString() + "%)", money(quote.taxAmount()), false);
            total("TOTAL (CAD)", money(quote.total()), true);
        }

        void total(String label, String amount, boolean bold) throws IOException {
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
            text(value, edge - font.getStringWidth(printable(value)) / 1000 * size, baseline, size, font, java.awt.Color.DARK_GRAY);
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
