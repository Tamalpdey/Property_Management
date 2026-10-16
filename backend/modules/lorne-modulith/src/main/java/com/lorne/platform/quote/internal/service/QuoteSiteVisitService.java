package com.lorne.platform.quote.internal.service;

import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.quote.internal.dto.QuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteSiteDetails;
import com.lorne.platform.quote.internal.dto.QuoteSiteDetails.*;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class QuoteSiteVisitService {
    private final JdbcTemplate jdbc;
    private final QuoteManagementService quotes;
    private final QuoteAccessService access;
    private final DocumentStorageService storage;
    private final TenantSettingsOperations settings;
    private final LornePublicUrlProperties urls;
    private final PasswordEncoder encoder;
    private final AuditWriter audit;

    public QuoteSiteVisitService(JdbcTemplate jdbc, QuoteManagementService quotes, QuoteAccessService access,
            DocumentStorageService storage, TenantSettingsOperations settings, LornePublicUrlProperties urls,
            PasswordEncoder encoder, AuditWriter audit) {
        this.jdbc = jdbc; this.quotes = quotes; this.access = access; this.storage = storage;
        this.settings = settings; this.urls = urls; this.encoder = encoder; this.audit = audit;
    }

    @Transactional(readOnly = true)
    public QuoteSiteDetails details(UUID tenant, UUID quote) {
        quotes.get(tenant, quote);
        return new QuoteSiteDetails(photos(tenant, quote, false), notes(tenant, quote), captureLink(tenant, quote));
    }

    @Transactional
    public CaptureLink createLink(UUID tenant, UUID actor, UUID quote, String password) {
        editable(tenant, quote);
        var existing = captureLink(tenant, quote);
        if (existing != null && existing.active()) {
            var passwordHash = jdbc.queryForObject("SELECT password_hash FROM quote_capture_links WHERE tenant_id = ? AND quote_id = ?", String.class, tenant, quote);
            if (password != null && !password.isEmpty() && (password.length() > 64
                    || password.getBytes(StandardCharsets.UTF_8).length > 72 || !encoder.matches(password, passwordHash)))
                throw new BadRequestException("This site visit link already has a password. Use the original password or revoke the link before creating new credentials.");
            return existing;
        }
        if (password == null || password.length() < 8 || password.length() > 64 || password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new BadRequestException("Use a password of 8 to 64 characters (up to 72 UTF-8 bytes).");
        var bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
        var token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("""
                INSERT INTO quote_capture_links(quote_id, tenant_id, token, token_hash, password_hash, expires_at)
                VALUES (?, ?, ?, ?, ?, now() + interval '7 days')
                ON CONFLICT (quote_id) DO UPDATE SET token = EXCLUDED.token, token_hash = EXCLUDED.token_hash,
                    password_hash = EXCLUDED.password_hash, expires_at = EXCLUDED.expires_at,
                    revoked_at = NULL, failed_attempts = 0, locked_until = NULL, created_at = now()
                """, quote, tenant, token, hash(token), encoder.encode(password));
        audit.record(tenant, actor, "QUOTE_CAPTURE_LINK_CREATED", "QUOTE", quote, Map.of());
        return captureLink(tenant, quote);
    }

    @Transactional
    public void revoke(UUID tenant, UUID actor, UUID quote) {
        var ids = jdbc.queryForList("SELECT id FROM quotes WHERE tenant_id = ? AND id = ? FOR UPDATE", UUID.class, tenant, quote);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Quote not found.");
        quotes.get(tenant, quote);
        jdbc.update("UPDATE quote_capture_links SET revoked_at = now() WHERE tenant_id = ? AND quote_id = ?", tenant, quote);
        audit.record(tenant, actor, "QUOTE_CAPTURE_LINK_REVOKED", "QUOTE", quote, Map.of());
    }

    @Transactional
    public CaptureView capture(String token, String password) {
        var owner = captureOwner(token, password);
        var quote = editable(owner.tenant(), owner.quote());
        var brand = settings.settings(owner.tenant());
        audit.record(owner.tenant(), null, "QUOTE_SITE_VISIT_OPENED", "QUOTE", owner.quote(), Map.of("source", "SITE_LINK"));
        return new CaptureView(brand.invoiceBrandName(), brand.logoUrl(), brand.themePrimaryColor(), quote.quoteNumber(),
                quote.title(), quote.propertyName(), quote.propertyAddress(), quote.scope(), owner.expiresAt(),
                photos(owner.tenant(), owner.quote(), false), notes(owner.tenant(), owner.quote()), brand.timezone());
    }

    @Transactional
    public Note addNote(UUID tenant, UUID actor, UUID quote, String author, String body) {
        editable(tenant, quote);
        return saveNote(tenant, actor, quote, author, body, "TENANT_PORTAL");
    }

    @Transactional
    public Note captureNote(String token, String password, String author, String body) {
        var owner = captureOwner(token, password); editable(owner.tenant(), owner.quote());
        return saveNote(owner.tenant(), null, owner.quote(), author, body, "SITE_LINK");
    }

    private Note saveNote(UUID tenant, UUID actor, UUID quote, String author, String body, String source) {
        author = text(author, 120, "Your name"); body = text(body, 10000, "Site note");
        if (jdbc.queryForObject("SELECT count(*) FROM quote_site_notes WHERE quote_id = ?", Integer.class, quote) >= 100)
            throw new BadRequestException("This quote already has 100 site notes.");
        var id = jdbc.queryForObject("""
                INSERT INTO quote_site_notes(tenant_id, quote_id, author_name, body, source) VALUES (?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, tenant, quote, author, body, source);
        audit.record(tenant, actor, "QUOTE_SITE_NOTE_ADDED", "QUOTE", quote, Map.of("noteId", id, "author", author, "source", source));
        return notes(tenant, quote).stream().filter(note -> note.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public Photo upload(UUID tenant, UUID actor, UUID quote, MultipartFile file, String caption, boolean visible, String author) {
        return upload(tenant, actor, quote, file, caption, visible, author, UUID.randomUUID());
    }

    @Transactional
    public Photo upload(UUID tenant, UUID actor, UUID quote, MultipartFile file, String caption, boolean visible, String author, UUID uploadId) {
        editable(tenant, quote);
        return savePhoto(tenant, actor, quote, file, caption, visible, author, "TENANT_PORTAL", uploadId);
    }

    @Transactional
    public Photo capturePhoto(String token, String password, MultipartFile file, String caption, boolean visible, String author) {
        return capturePhoto(token, password, file, caption, visible, author, UUID.randomUUID());
    }

    @Transactional
    public Photo capturePhoto(String token, String password, MultipartFile file, String caption, boolean visible, String author, UUID uploadId) {
        var owner = captureOwner(token, password); editable(owner.tenant(), owner.quote());
        return savePhoto(owner.tenant(), null, owner.quote(), file, caption, visible, author, "SITE_LINK", uploadId);
    }

    private Photo savePhoto(UUID tenant, UUID actor, UUID quote, MultipartFile file, String caption, boolean visible, String author, String source, UUID uploadId) {
        if (uploadId == null) throw new BadRequestException("Upload ID is required.");
        var previous = jdbc.queryForList("SELECT id FROM quote_photos WHERE tenant_id = ? AND quote_id = ? AND upload_id = ?", UUID.class, tenant, quote, uploadId);
        if (!previous.isEmpty()) return photos(tenant, quote, false).stream().filter(photo -> photo.id().equals(previous.getFirst())).findFirst().orElseThrow();
        author = text(author, 120, "Your name");
        if (caption == null) caption = "";
        if (caption.length() > 500) throw new BadRequestException("Caption must be at most 500 characters.");
        if (jdbc.queryForObject("SELECT count(*) FROM quote_photos WHERE quote_id = ?", Integer.class, quote) >= 30)
            throw new BadRequestException("A quote can have up to 30 photos.");
        var document = storage.storeQuotePhoto(tenant, actor, quote, normalizedPhoto(file), "image/jpeg");
        var id = jdbc.queryForObject("""
                INSERT INTO quote_photos(tenant_id, quote_id, document_id, caption, client_visible, author_name, source, upload_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, tenant, quote, document, caption.trim(), visible, author, source, uploadId);
        audit.record(tenant, actor, "QUOTE_PHOTO_ADDED", "QUOTE", quote, Map.of("photoId", id, "author", author, "source", source, "clientVisible", visible));
        return photos(tenant, quote, false).stream().filter(photo -> photo.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void updatePhoto(UUID tenant, UUID actor, UUID quote, UUID photo, String caption, boolean visible) {
        editable(tenant, quote);
        if (caption == null || caption.length() > 500) throw new BadRequestException("Caption must be at most 500 characters.");
        if (jdbc.update("UPDATE quote_photos SET caption = ?, client_visible = ? WHERE tenant_id = ? AND quote_id = ? AND id = ?",
                caption.trim(), visible, tenant, quote, photo) == 0) throw new ResourceNotFoundException("Photo not found.");
        audit.record(tenant, actor, "QUOTE_PHOTO_UPDATED", "QUOTE", quote, Map.of("photoId", photo, "clientVisible", visible));
    }

    @Transactional
    public void deletePhoto(UUID tenant, UUID actor, UUID quote, UUID photo) {
        editable(tenant, quote);
        var ids = jdbc.queryForList("DELETE FROM quote_photos WHERE tenant_id = ? AND quote_id = ? AND id = ? RETURNING document_id", UUID.class, tenant, quote, photo);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Photo not found.");
        storage.deleteQuotePhoto(tenant, quote, ids.getFirst());
        audit.record(tenant, actor, "QUOTE_PHOTO_REMOVED", "QUOTE", quote, Map.of("photoId", photo));
    }

    @Transactional(readOnly = true)
    public DocumentStorageService.StoredLogo photo(UUID tenant, UUID quote, UUID photo) {
        quotes.get(tenant, quote);
        return photoBytes(tenant, quote, photo, false);
    }

    @Transactional
    public List<Photo> clientPhotos(String token, String password) {
        var quote = quotes.publicPhotoQuote(token, password);
        return photos(tenant(quote.id()), quote.id(), true);
    }

    @Transactional
    public DocumentStorageService.StoredLogo clientPhoto(String token, String password, UUID photo) {
        var quote = quotes.publicPhotoQuote(token, password);
        return photoBytes(tenant(quote.id()), quote.id(), photo, true);
    }

    @Transactional
    public DocumentStorageService.StoredLogo capturePhotoBytes(String token, String password, UUID photo) {
        var owner = captureOwner(token, password); editable(owner.tenant(), owner.quote());
        return photoBytes(owner.tenant(), owner.quote(), photo, false);
    }

    private DocumentStorageService.StoredLogo photoBytes(UUID tenant, UUID quote, UUID photo, boolean visibleOnly) {
        var ids = jdbc.queryForList("SELECT document_id FROM quote_photos WHERE tenant_id = ? AND quote_id = ? AND id = ? AND (? = false OR client_visible)",
                UUID.class, tenant, quote, photo, visibleOnly);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Photo not found.");
        return storage.quotePhoto(tenant, quote, ids.getFirst());
    }

    private List<Photo> photos(UUID tenant, UUID quote, boolean visibleOnly) {
        return jdbc.query("""
                SELECT * FROM quote_photos WHERE tenant_id = ? AND quote_id = ? AND (? = false OR client_visible) ORDER BY created_at, id
                """, (rs, row) -> new Photo(rs.getObject("id", UUID.class), rs.getString("caption"), rs.getBoolean("client_visible"),
                rs.getString("author_name"), rs.getString("source"), rs.getTimestamp("created_at").toInstant()), tenant, quote, visibleOnly);
    }

    private List<Note> notes(UUID tenant, UUID quote) {
        return jdbc.query("SELECT * FROM quote_site_notes WHERE tenant_id = ? AND quote_id = ? ORDER BY created_at DESC, id",
                (rs, row) -> new Note(rs.getObject("id", UUID.class), rs.getString("author_name"), rs.getString("body"), rs.getString("source"),
                        rs.getTimestamp("created_at").toInstant()), tenant, quote);
    }

    private CaptureLink captureLink(UUID tenant, UUID quote) {
        var rows = jdbc.query("""
                SELECT token, expires_at, revoked_at IS NULL AND expires_at > now() AS active
                FROM quote_capture_links WHERE tenant_id = ? AND quote_id = ?
                """, (rs, row) -> new CaptureLink(captureUrl(tenant, rs.getString("token")), rs.getTimestamp("expires_at").toInstant(), rs.getBoolean("active")), tenant, quote);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private QuoteDto editable(UUID tenant, UUID quote) {
        var ids = jdbc.queryForList("SELECT id FROM quotes WHERE tenant_id = ? AND id = ? FOR UPDATE", UUID.class, tenant, quote);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Quote not found.");
        var record = quotes.get(tenant, quote);
        if (!List.of("DRAFT", "DECLINED").contains(record.status())) throw new BadRequestException("Site capture is closed. This quote has been published or locked.");
        return record;
    }

    private Owner captureOwner(String token, String password) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw new ResourceNotFoundException("Site visit link not found.");
        access.verifyCapture(hash(token), password);
        // Parent first, then link: publication takes locks in the same order.
        var owners = jdbc.query("SELECT tenant_id, quote_id, expires_at FROM quote_capture_links WHERE token_hash = ?",
                (rs, row) -> new Owner(rs.getObject("tenant_id", UUID.class), rs.getObject("quote_id", UUID.class), rs.getTimestamp("expires_at").toInstant()), hash(token));
        if (owners.isEmpty()) throw new ResourceNotFoundException("Site visit link not found.");
        var owner = owners.getFirst(); editable(owner.tenant(), owner.quote());
        var active = jdbc.queryForObject("SELECT count(*) FROM quote_capture_links WHERE quote_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > now()",
                Integer.class, owner.quote(), hash(token));
        if (active == null || active == 0) throw new BadRequestException("This site visit link has expired or been revoked.");
        return owner;
    }

    private UUID tenant(UUID quote) { return jdbc.queryForObject("SELECT tenant_id FROM quotes WHERE id = ?", UUID.class, quote); }

    private String captureUrl(UUID tenant, String token) {
        var profile = settings.settings(tenant);
        var base = urls.tenantPortal() == null || urls.tenantPortal().isBlank() ? "http://localhost:4500" : urls.tenantPortal();
        if (urls.rootDomain() != null && !urls.rootDomain().isBlank() && profile.portalSubdomain() != null && !profile.portalSubdomain().isBlank())
            base = "https://" + profile.portalSubdomain() + ".app." + urls.rootDomain().trim();
        return base.replaceAll("/+$", "") + "/quote-capture/" + token;
    }

    private String text(String value, int max, String label) {
        if (value == null || value.isBlank() || value.length() > max) throw new BadRequestException(label + " is required and must be at most " + max + " characters.");
        return value.trim();
    }

    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    static byte[] normalizedPhoto(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > 10 * 1024 * 1024) throw new BadRequestException("Select a photo smaller than 10 MB.");
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(file.getBytes()))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new BadRequestException("Use a JPG or PNG photo.");
            var reader = readers.next();
            try {
                if (!List.of("JPEG", "PNG").contains(reader.getFormatName().toUpperCase(java.util.Locale.ROOT)))
                    throw new BadRequestException("Use a JPG or PNG photo.");
                reader.setInput(input);
                var width = reader.getWidth(0); var height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || (long) width * height > 40_000_000) throw new BadRequestException("Photo dimensions are too large.");
                var sample = Math.max(1, Math.max(width, height) / 2048);
                var params = reader.getDefaultReadParam(); params.setSourceSubsampling(sample, sample, 0, 0);
                var image = reader.read(0, params);
                var clean = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
                var graphics = clean.createGraphics(); graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, clean.getWidth(), clean.getHeight());
                graphics.drawImage(image, 0, 0, null); graphics.dispose();
                var output = new ByteArrayOutputStream(); ImageIO.write(clean, "jpeg", output);
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (java.io.IOException exception) { throw new BadRequestException("The photo could not be read. Try a JPG or PNG image."); }
    }

    private record Owner(UUID tenant, UUID quote, Instant expiresAt) { }
}
