package com.lorne.platform.quote.internal.service;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class QuoteAccessService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final TransactionTemplate transaction;

    public QuoteAccessService(JdbcTemplate jdbc, PasswordEncoder encoder, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void verify(String tokenHash, String password) {
        verify(tokenHash, password, false);
    }

    public void verifyCapture(String tokenHash, String password) {
        verify(tokenHash, password, true);
    }

    private void verify(String tokenHash, String password, boolean capture) {
        var table = capture ? "quote_capture_links" : "quotes";
        var idColumn = capture ? "quote_id" : "id";
        var tokenColumn = capture ? "token_hash" : "approval_token_hash";
        var passwordColumn = capture ? "password_hash" : "access_password_hash";
        var failuresColumn = capture ? "failed_attempts" : "access_failed_attempts";
        var lockedColumn = capture ? "locked_until" : "access_locked_until";
        var outcome = transaction.execute(status -> {
            var rows = jdbc.query("""
                    SELECT %s AS id, %s AS access_password_hash, %s AS access_failed_attempts,
                           coalesce(%s > now(), false) AS locked
                    FROM %s WHERE %s = ? FOR UPDATE
                    """.formatted(idColumn, passwordColumn, failuresColumn, lockedColumn, table, tokenColumn),
                    (rs, row) -> new Access(rs.getObject("id", UUID.class), rs.getString("access_password_hash"),
                    rs.getInt("access_failed_attempts"), rs.getBoolean("locked")), tokenHash);
            if (rows.isEmpty()) return HttpStatus.NOT_FOUND;
            var access = rows.getFirst();
            if (access.locked()) return HttpStatus.TOO_MANY_REQUESTS;
            if (password == null || password.length() > 64 || access.passwordHash() == null
                    || !encoder.matches(password, access.passwordHash())) {
                jdbc.update("""
                        UPDATE %s SET %s = %s + 1,
                            %s = CASE WHEN %s >= 4 THEN now() + interval '5 minutes' ELSE NULL END
                        WHERE %s = ?
                        """.formatted(table, failuresColumn, failuresColumn, lockedColumn, failuresColumn, idColumn), access.id());
                return HttpStatus.UNAUTHORIZED;
            }
            jdbc.update("UPDATE %s SET %s = 0, %s = NULL WHERE %s = ?".formatted(table, failuresColumn, lockedColumn, idColumn), access.id());
            return HttpStatus.OK;
        });
        if (outcome != HttpStatus.OK) {
            throw new ResponseStatusException(outcome == null ? HttpStatus.UNAUTHORIZED : outcome,
                    outcome == HttpStatus.TOO_MANY_REQUESTS ? "Too many attempts. Try again in five minutes." : "The quote link or password is invalid.");
        }
    }

    private record Access(UUID id, String passwordHash, int failures, boolean locked) { }
}
