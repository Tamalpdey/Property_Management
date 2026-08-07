package com.lorne.platform.auth.internal.security;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TokenProvider {
    private static final Logger log = LoggerFactory.getLogger(TokenProvider.class);

    @Value("${lorne.jwt.secret:${JWT_SECRET:lorne-local-development-secret-must-be-over-sixty-four-characters-change-in-production}}")
    private String jwtSecret;

    @Value("${lorne.jwt.access-token-expiration-ms:3600000}")
    private long accessTokenExpirationMs;

    public String generateAccessToken(CurrentUserResponse user) {
        var now = Instant.now();
        var expiresAt = now.plusMillis(accessTokenExpirationMs);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(user.id().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim(JwtClaims.TYPE, JwtClaims.ACCESS_TYPE)
                .claim(JwtClaims.EMAIL, user.email())
                .claim(JwtClaims.DISPLAY_NAME, user.displayName())
                .claim(JwtClaims.TENANT_ID, user.tenantId() == null ? null : user.tenantId().toString())
                .claim(JwtClaims.ROLES, user.roles())
                .claim(JwtClaims.PERMISSIONS, user.permissions())
                .signWith(signingKey(), Jwts.SIG.HS512)
                .compact();
    }

    public JwtPrincipal parseAccessToken(String token) {
        var claims = extractClaims(token);
        var tokenType = claims.get(JwtClaims.TYPE, String.class);
        if (!JwtClaims.ACCESS_TYPE.equals(tokenType)) {
            throw new SecurityException("Invalid token type");
        }

        var tenantId = claims.get(JwtClaims.TENANT_ID, String.class);
        return new JwtPrincipal(
                UUID.fromString(claims.getSubject()),
                tenantId == null || tenantId.isBlank() ? null : UUID.fromString(tenantId),
                claims.get(JwtClaims.EMAIL, String.class),
                claims.get(JwtClaims.DISPLAY_NAME, String.class),
                stringListClaim(claims, JwtClaims.ROLES),
                stringListClaim(claims, JwtClaims.PERMISSIONS)
        );
    }

    public long accessTokenExpirationSeconds() {
        return accessTokenExpirationMs / 1000;
    }

    private Claims extractClaims(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(signingKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (SecurityException | MalformedJwtException | ExpiredJwtException | UnsupportedJwtException |
                 IllegalArgumentException exception) {
            log.debug("JWT validation failed: {}", exception.getMessage());
            throw new SecurityException("Invalid or expired token", exception);
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> stringListClaim(Claims claims, String claimName) {
        var value = claims.get(claimName, List.class);
        if (value == null) {
            return List.of();
        }
        return value.stream().map(String::valueOf).toList();
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
