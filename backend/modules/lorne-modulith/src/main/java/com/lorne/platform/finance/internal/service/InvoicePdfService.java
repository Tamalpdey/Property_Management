package com.lorne.platform.finance.internal.service;

import com.lorne.platform.finance.internal.dto.InvoiceDto;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

@Service
public class InvoicePdfService {
    private static final float MARGIN = 42;
    private static final float PAGE_WIDTH = PDRectangle.LETTER.getWidth();
    private static final float PAGE_HEIGHT = PDRectangle.LETTER.getHeight();
    private static final PDType1Font FONT = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

    public byte[] generate(InvoiceDto invoice) {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var writer = new PdfWriter(document);
            writer.page();
            writer.text("INVOICE", BOLD, 10, 0, 0);
            writer.text(invoice.invoiceNumber(), BOLD, 26, 0, 18);
            writer.text(status(invoice.status()), FONT, 11, 0, 14);
            writer.y -= 8;
            writer.line();
            writer.y -= 16;

            writer.twoColumnSection(
                    "Bill To",
                    lines(invoice.ownerName(), firstNonBlank(invoice.ownerBillingEmail(), invoice.ownerEmail(), ""), ""),
                    "Invoice",
                    lines("Issued: " + value(invoice.issuedOn()), "Due: " + value(invoice.dueOn()), "Status: " + status(invoice.status()))
            );

            writer.twoColumnSection(
                    "Property",
                    lines(invoice.propertyName(), invoice.propertyAddress(), ""),
                    "Work Order",
                    lines(invoice.workOrderNumber(), invoice.workOrderTitle(), "")
            );

            writer.sectionTitle("Line Items");
            writer.tableHeader();
            for (var line : invoice.lines()) {
                writer.tableRow(
                        line.description(),
                        quantity(line.quantity()),
                        money(line.unitPrice()),
                        money(line.lineTotal())
                );
            }
            if (invoice.lines().isEmpty()) {
                writer.text("No line items.", FONT, 10, 0, 14);
            }

            writer.y -= 18;
            writer.totalRow("Subtotal", money(invoice.subtotal()));
            writer.totalRow("Tax", money(invoice.taxTotal()));
            writer.totalRow("Total", money(invoice.total()));
            writer.close();
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Invoice PDF could not be generated.", exception);
        }
    }

    private String[] lines(String first, String second, String third) {
        return new String[] { value(first), value(second), value(third) };
    }

    private String value(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String status(String value) {
        return value == null ? "" : value.toLowerCase().replace('_', ' ');
    }

    private String quantity(BigDecimal value) {
        return value == null ? "0" : value.stripTrailingZeros().toPlainString();
    }

    private String money(BigDecimal value) {
        var amount = value == null ? BigDecimal.ZERO : value;
        return "$" + amount.setScale(2, RoundingMode.HALF_UP);
    }

    private static final class PdfWriter {
        private final PDDocument document;
        private PDPageContentStream content;
        private float y;

        private PdfWriter(PDDocument document) {
            this.document = document;
        }

        private void page() throws IOException {
            if (content != null) {
                content.close();
            }
            var page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            content = new PDPageContentStream(document, page);
            y = PAGE_HEIGHT - MARGIN;
        }

        private void close() throws IOException {
            if (content != null) {
                content.close();
            }
        }

        private void ensure(float requiredHeight) throws IOException {
            if (y - requiredHeight < MARGIN) {
                page();
            }
        }

        private void text(String value, PDType1Font font, float size, float xOffset, float lineHeight) throws IOException {
            ensure(lineHeight + 4);
            content.beginText();
            content.setFont(font, size);
            content.newLineAtOffset(MARGIN + xOffset, y);
            content.showText(clean(value));
            content.endText();
            y -= lineHeight;
        }

        private void line() throws IOException {
            content.setLineWidth(1.2f);
            content.moveTo(MARGIN, y);
            content.lineTo(PAGE_WIDTH - MARGIN, y);
            content.stroke();
        }

        private void sectionTitle(String title) throws IOException {
            ensure(34);
            text(title.toUpperCase(), BOLD, 10, 0, 16);
        }

        private void twoColumnSection(String leftTitle, String[] leftLines, String rightTitle, String[] rightLines) throws IOException {
            ensure(96);
            var top = y;
            box(MARGIN, top - 76, (PAGE_WIDTH - (MARGIN * 2) - 12) / 2, 76);
            box((PAGE_WIDTH / 2) + 6, top - 76, (PAGE_WIDTH - (MARGIN * 2) - 12) / 2, 76);
            writeBlock(MARGIN + 10, top - 18, leftTitle, leftLines);
            writeBlock((PAGE_WIDTH / 2) + 16, top - 18, rightTitle, rightLines);
            y = top - 90;
        }

        private void writeBlock(float x, float startY, String title, String[] lines) throws IOException {
            content.beginText();
            content.setFont(BOLD, 9);
            content.newLineAtOffset(x, startY);
            content.showText(clean(title.toUpperCase()));
            content.endText();
            var lineY = startY - 16;
            for (var line : lines) {
                if (line == null || line.isBlank()) {
                    continue;
                }
                content.beginText();
                content.setFont(FONT, 10);
                content.newLineAtOffset(x, lineY);
                content.showText(clean(line));
                content.endText();
                lineY -= 13;
            }
        }

        private void tableHeader() throws IOException {
            ensure(42);
            var top = y;
            fillColor(243, 244, 246);
            content.addRect(MARGIN, top - 22, PAGE_WIDTH - (MARGIN * 2), 22);
            content.fill();
            fillColor(17, 24, 39);
            rowText("Description", MARGIN + 6, top - 15, BOLD, 9);
            rowText("Qty", PAGE_WIDTH - 210, top - 15, BOLD, 9);
            rowText("Unit", PAGE_WIDTH - 152, top - 15, BOLD, 9);
            rowText("Line total", PAGE_WIDTH - 90, top - 15, BOLD, 9);
            y = top - 25;
        }

        private void tableRow(String description, String quantity, String unitPrice, String lineTotal) throws IOException {
            ensure(28);
            var wrapped = wrap(description, 70);
            var rowHeight = Math.max(22, wrapped.length * 12 + 8);
            ensure(rowHeight + 4);
            box(MARGIN, y - rowHeight, PAGE_WIDTH - (MARGIN * 2), rowHeight);
            var lineY = y - 14;
            for (var line : wrapped) {
                rowText(line, MARGIN + 6, lineY, FONT, 9);
                lineY -= 12;
            }
            rowText(quantity, PAGE_WIDTH - 210, y - 14, FONT, 9);
            rowText(unitPrice, PAGE_WIDTH - 152, y - 14, FONT, 9);
            rowText(lineTotal, PAGE_WIDTH - 90, y - 14, BOLD, 9);
            y -= rowHeight;
        }

        private void totalRow(String label, String value) throws IOException {
            ensure(20);
            rowText(label, PAGE_WIDTH - 210, y, BOLD, 10);
            rowText(value, PAGE_WIDTH - 90, y, BOLD, 10);
            y -= 16;
        }

        private void box(float x, float y, float width, float height) throws IOException {
            content.setLineWidth(0.6f);
            content.addRect(x, y, width, height);
            content.stroke();
        }

        private void rowText(String value, float x, float y, PDType1Font font, float size) throws IOException {
            content.beginText();
            content.setFont(font, size);
            content.newLineAtOffset(x, y);
            content.showText(clean(value));
            content.endText();
        }

        private void fillColor(int red, int green, int blue) throws IOException {
            content.setNonStrokingColor(red / 255f, green / 255f, blue / 255f);
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
            return value == null ? "" : value.replaceAll("[\\r\\n\\t]+", " ").replaceAll("[^\\x20-\\x7E]", "");
        }
    }
}
