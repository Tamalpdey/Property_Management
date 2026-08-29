package com.lorne.platform.communication.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.communication.internal.dto.CommunicationChannelType;
import com.lorne.platform.communication.internal.dto.ConversationDto;
import com.lorne.platform.communication.internal.dto.ConversationMessageDto;
import com.lorne.platform.communication.internal.dto.ConversationParticipantDto;
import com.lorne.platform.communication.internal.dto.ConversationThreadDto;
import com.lorne.platform.communication.internal.dto.CreateConversationRequest;
import com.lorne.platform.communication.internal.dto.SendMessageRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class CommunicationService {
    private static final int MAX_MESSAGE_LENGTH = 4000;

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    CommunicationService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    public List<ConversationDto> tenantConversations(UUID tenantId, UUID actorUserId, String channelType, UUID workOrderId) {
        var args = new ArrayList<Object>();
        args.add(tenantId);
        var sql = new StringBuilder("""
                SELECT c.id, c.channel_type::text AS channel_type, c.work_order_id, wo.work_order_number,
                       c.title, last_message.body AS last_message_preview,
                       COALESCE(c.last_message_at, c.created_at) AS last_message_at
                FROM communication_conversations c
                LEFT JOIN work_orders wo ON wo.tenant_id = c.tenant_id AND wo.id = c.work_order_id
                LEFT JOIN LATERAL (
                    SELECT m.body
                    FROM communication_messages m
                    WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id AND m.deleted_at IS NULL
                    ORDER BY m.created_at DESC
                    LIMIT 1
                ) last_message ON true
                WHERE c.tenant_id = ?
                """);
        sql.append("""
                  AND (
                    c.channel_type <> 'WORKER_DIRECT'::communication_channel_type
                    OR EXISTS (
                        SELECT 1
                        FROM communication_participants p
                        WHERE p.tenant_id = c.tenant_id
                          AND p.conversation_id = c.id
                          AND p.user_id = ?
                    )
                  )
                """);
        args.add(actorUserId);

        if (StringUtils.hasText(channelType) && !"ALL".equalsIgnoreCase(channelType)) {
            sql.append(" AND c.channel_type = ?::communication_channel_type");
            args.add(channelType.trim().toUpperCase(Locale.ROOT));
        }
        if (workOrderId != null) {
            sql.append(" AND c.work_order_id = ?");
            args.add(workOrderId);
        }
        sql.append(" ORDER BY COALESCE(c.last_message_at, c.created_at) DESC");

        return jdbcTemplate.query(sql.toString(), this::mapConversationRow, args.toArray())
                .stream()
                .map((conversation) -> hydrateConversation(tenantId, actorUserId, conversation))
                .toList();
    }

    @Transactional
    public ConversationThreadDto tenantThread(UUID tenantId, UUID actorUserId, UUID conversationId) {
        var conversation = requireTenantConversationAccess(tenantId, actorUserId, conversationId);
        return new ConversationThreadDto(
                hydrateConversation(tenantId, actorUserId, conversation),
                messages(tenantId, actorUserId, conversationId)
        );
    }

    @Transactional
    public ConversationThreadDto createTenantConversation(UUID tenantId, UUID actorUserId, CreateConversationRequest request) {
        var channelType = request.channelType() != null
                ? request.channelType()
                : request.workOrderId() != null ? CommunicationChannelType.WORK_ORDER : CommunicationChannelType.WORKER_OPERATIONS;
        if (channelType == CommunicationChannelType.WORK_ORDER && request.workOrderId() == null) {
            throw new BadRequestException("Select a work order for a work-order conversation.");
        }
        if (channelType == CommunicationChannelType.WORKER_DIRECT) {
            validateTenantDirectWorkerRecipients(tenantId, request.participantUserIds());
        }

        UUID conversationId;
        if (channelType == CommunicationChannelType.WORK_ORDER) {
            var workOrder = workOrderSummary(tenantId, request.workOrderId())
                    .orElseThrow(() -> new ResourceNotFoundException("Work order was not found."));
            conversationId = findWorkOrderConversation(tenantId, request.workOrderId())
                    .orElseGet(() -> createConversation(
                            tenantId,
                            actorUserId,
                            channelType,
                            request.workOrderId(),
                            firstNonBlank(request.title(), workOrder.title(), workOrder.workOrderNumber())
                    ));
            addAssignedWorkersAsParticipants(tenantId, actorUserId, conversationId, request.workOrderId());
        } else {
            conversationId = createConversation(
                    tenantId,
                    actorUserId,
                    channelType,
                    null,
                    firstNonBlank(request.title(), defaultTitle(channelType))
            );
        }

        addParticipant(tenantId, conversationId, actorUserId, null, "operations", actorUserId);
        for (var participantUserId : uniqueIds(request.participantUserIds())) {
            addParticipant(tenantId, conversationId, participantUserId, workerIdForUser(tenantId, participantUserId).orElse(null), "member", actorUserId);
        }
        sendInitialMessageIfPresent(tenantId, actorUserId, conversationId, request.initialMessage());
        return tenantThread(tenantId, actorUserId, conversationId);
    }

    @Transactional
    public ConversationMessageDto sendTenantMessage(UUID tenantId, UUID actorUserId, UUID conversationId, SendMessageRequest request) {
        requireTenantConversationAccess(tenantId, actorUserId, conversationId);
        addParticipant(tenantId, conversationId, actorUserId, null, "operations", actorUserId);
        return insertMessage(tenantId, actorUserId, null, conversationId, request.body());
    }

    @Transactional
    public ConversationThreadDto markTenantRead(UUID tenantId, UUID actorUserId, UUID conversationId) {
        requireTenantConversationAccess(tenantId, actorUserId, conversationId);
        addParticipant(tenantId, conversationId, actorUserId, null, "operations", actorUserId);
        markRead(tenantId, actorUserId, conversationId);
        return tenantThread(tenantId, actorUserId, conversationId);
    }

    public List<ConversationDto> workerConversations(UUID tenantId, UUID userId, String email) {
        var worker = requireWorker(tenantId, userId, email);
        return jdbcTemplate.query("""
                SELECT DISTINCT c.id, c.channel_type::text AS channel_type, c.work_order_id, wo.work_order_number,
                       c.title, last_message.body AS last_message_preview,
                       COALESCE(c.last_message_at, c.created_at) AS last_message_at
                FROM communication_conversations c
                LEFT JOIN work_orders wo ON wo.tenant_id = c.tenant_id AND wo.id = c.work_order_id
                LEFT JOIN LATERAL (
                    SELECT m.body
                    FROM communication_messages m
                    WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id AND m.deleted_at IS NULL
                    ORDER BY m.created_at DESC
                    LIMIT 1
                ) last_message ON true
                WHERE c.tenant_id = ?
                  AND (
                    EXISTS (
                        SELECT 1 FROM communication_participants p
                        WHERE p.tenant_id = c.tenant_id AND p.conversation_id = c.id AND p.user_id = ?
                    )
                    OR (
                        c.channel_type = 'WORK_ORDER'::communication_channel_type
                        AND EXISTS (
                            SELECT 1 FROM work_order_assignments woa
                            WHERE woa.tenant_id = c.tenant_id
                              AND woa.work_order_id = c.work_order_id
                              AND woa.worker_id = ?
                        )
                    )
                  )
                ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
                """, this::mapConversationRow, tenantId, userId, worker.id())
                .stream()
                .map((conversation) -> hydrateConversation(tenantId, userId, conversation))
                .toList();
    }

    @Transactional
    public ConversationThreadDto workerThread(UUID tenantId, UUID userId, String email, UUID conversationId) {
        requireWorkerCanAccess(tenantId, userId, email, conversationId);
        addParticipant(tenantId, conversationId, userId, workerIdForUser(tenantId, userId).orElse(null), "worker", userId);
        return new ConversationThreadDto(
                hydrateConversation(tenantId, userId, findConversation(tenantId, conversationId).orElseThrow()),
                messages(tenantId, userId, conversationId)
        );
    }

    @Transactional
    public ConversationThreadDto createWorkerOperationsConversation(UUID tenantId, UUID userId, String email, CreateConversationRequest request) {
        var worker = requireWorker(tenantId, userId, email);
        var conversationId = findWorkerOperationsConversation(tenantId, worker.id())
                .orElseGet(() -> createConversation(
                        tenantId,
                        userId,
                        CommunicationChannelType.WORKER_OPERATIONS,
                        null,
                        firstNonBlank(request.title(), "Operations chat - " + worker.displayName())
                ));

        addParticipant(tenantId, conversationId, userId, worker.id(), "worker", userId);
        for (var operationsUserId : tenantOperationsUsers(tenantId)) {
            addParticipant(tenantId, conversationId, operationsUserId, workerIdForUser(tenantId, operationsUserId).orElse(null), "operations", userId);
        }
        sendInitialMessageIfPresent(tenantId, userId, conversationId, request.initialMessage());
        return workerThread(tenantId, userId, email, conversationId);
    }

    @Transactional
    public ConversationMessageDto sendWorkerMessage(UUID tenantId, UUID userId, String email, UUID conversationId, SendMessageRequest request) {
        var worker = requireWorkerCanAccess(tenantId, userId, email, conversationId);
        addParticipant(tenantId, conversationId, userId, worker.id(), "worker", userId);
        return insertMessage(tenantId, userId, worker.id(), conversationId, request.body());
    }

    @Transactional
    public ConversationThreadDto markWorkerRead(UUID tenantId, UUID userId, String email, UUID conversationId) {
        var worker = requireWorkerCanAccess(tenantId, userId, email, conversationId);
        addParticipant(tenantId, conversationId, userId, worker.id(), "worker", userId);
        markRead(tenantId, userId, conversationId);
        return workerThread(tenantId, userId, email, conversationId);
    }

    private UUID createConversation(
            UUID tenantId,
            UUID actorUserId,
            CommunicationChannelType channelType,
            UUID workOrderId,
            String title
    ) {
        var conversationId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO communication_conversations (
                    id, tenant_id, channel_type, work_order_id, title, created_by_user_id, last_message_at
                )
                VALUES (?, ?, ?::communication_channel_type, ?, ?, ?, now())
                """, conversationId, tenantId, channelType.name(), workOrderId, title, actorUserId);
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("channelType", channelType.name());
        metadata.put("workOrderId", workOrderId);
        metadata.put("title", title);
        auditWriter.record(tenantId, actorUserId, "COMMUNICATION_CONVERSATION_CREATED", "COMMUNICATION", conversationId, metadata);
        return conversationId;
    }

    private void sendInitialMessageIfPresent(UUID tenantId, UUID actorUserId, UUID conversationId, String initialMessage) {
        if (StringUtils.hasText(initialMessage)) {
            insertMessage(tenantId, actorUserId, workerIdForUser(tenantId, actorUserId).orElse(null), conversationId, initialMessage);
        }
    }

    private ConversationMessageDto insertMessage(UUID tenantId, UUID senderUserId, UUID senderWorkerId, UUID conversationId, String body) {
        var trimmedBody = body == null ? "" : body.trim();
        if (!StringUtils.hasText(trimmedBody)) {
            throw new BadRequestException("Message cannot be empty.");
        }
        if (trimmedBody.length() > MAX_MESSAGE_LENGTH) {
            throw new BadRequestException("Message is too long.");
        }

        var messageId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO communication_messages (
                    id, tenant_id, conversation_id, sender_user_id, sender_worker_id, body
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """, messageId, tenantId, conversationId, senderUserId, senderWorkerId, trimmedBody);
        jdbcTemplate.update("""
                UPDATE communication_conversations
                SET last_message_at = now(), updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, tenantId, conversationId);

        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("conversationId", conversationId);
        metadata.put("messageId", messageId);
        auditWriter.record(tenantId, senderUserId, "COMMUNICATION_MESSAGE_SENT", "COMMUNICATION", conversationId, metadata);
        return messages(tenantId, senderUserId, conversationId).stream()
                .filter((message) -> message.id().equals(messageId))
                .findFirst()
                .orElseThrow();
    }

    private void markRead(UUID tenantId, UUID actorUserId, UUID conversationId) {
        jdbcTemplate.update("""
                UPDATE communication_participants
                SET last_read_at = now()
                WHERE tenant_id = ? AND conversation_id = ? AND user_id = ?
                """, tenantId, conversationId, actorUserId);
        auditWriter.record(
                tenantId,
                actorUserId,
                "COMMUNICATION_MARKED_READ",
                "COMMUNICATION",
                conversationId,
                Map.of("conversationId", conversationId)
        );
    }

    private ConversationDto hydrateConversation(UUID tenantId, UUID actorUserId, ConversationDto conversation) {
        return new ConversationDto(
                conversation.id(),
                conversation.channelType(),
                conversation.workOrderId(),
                conversation.workOrderNumber(),
                conversation.title(),
                conversation.lastMessagePreview(),
                conversation.lastMessageAt(),
                unreadCount(tenantId, actorUserId, conversation.id()),
                participants(tenantId, conversation.id())
        );
    }

    private List<ConversationParticipantDto> participants(UUID tenantId, UUID conversationId) {
        return jdbcTemplate.query("""
                SELECT p.user_id, p.worker_id, u.display_name, u.email::text AS email,
                       p.participant_role, p.last_read_at
                FROM communication_participants p
                JOIN app_users u ON u.id = p.user_id
                WHERE p.tenant_id = ? AND p.conversation_id = ?
                ORDER BY CASE WHEN p.participant_role = 'operations' THEN 0 ELSE 1 END, u.display_name
                """, (rs, rowNum) -> new ConversationParticipantDto(
                        rs.getObject("user_id", UUID.class),
                        rs.getObject("worker_id", UUID.class),
                        rs.getString("display_name"),
                        rs.getString("email"),
                        rs.getString("participant_role"),
                        instant(rs, "last_read_at")
                ), tenantId, conversationId);
    }

    private List<ConversationMessageDto> messages(UUID tenantId, UUID actorUserId, UUID conversationId) {
        return jdbcTemplate.query("""
                SELECT m.id, m.conversation_id, m.sender_user_id, m.sender_worker_id,
                       COALESCE(w.display_name, u.display_name) AS sender_name,
                       u.email::text AS sender_email,
                       COALESCE(role_codes.roles, '') AS sender_role,
                       m.body, m.created_at
                FROM communication_messages m
                JOIN app_users u ON u.id = m.sender_user_id
                LEFT JOIN workers w ON w.tenant_id = m.tenant_id AND w.id = m.sender_worker_id
                LEFT JOIN LATERAL (
                    SELECT string_agg(r.code, ', ' ORDER BY r.code) AS roles
                    FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id
                    WHERE utr.tenant_id = m.tenant_id AND utr.user_id = m.sender_user_id
                ) role_codes ON true
                WHERE m.tenant_id = ? AND m.conversation_id = ? AND m.deleted_at IS NULL
                ORDER BY m.created_at
                """, (rs, rowNum) -> new ConversationMessageDto(
                        rs.getObject("id", UUID.class),
                        rs.getObject("conversation_id", UUID.class),
                        rs.getObject("sender_user_id", UUID.class),
                        rs.getObject("sender_worker_id", UUID.class),
                        rs.getString("sender_name"),
                        rs.getString("sender_email"),
                        readableRole(rs.getString("sender_role")),
                        rs.getString("body"),
                        instant(rs, "created_at"),
                        actorUserId.equals(rs.getObject("sender_user_id", UUID.class))
                ), tenantId, conversationId);
    }

    private int unreadCount(UUID tenantId, UUID actorUserId, UUID conversationId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM communication_messages m
                LEFT JOIN communication_participants p
                  ON p.tenant_id = m.tenant_id
                 AND p.conversation_id = m.conversation_id
                 AND p.user_id = ?
                WHERE m.tenant_id = ?
                  AND m.conversation_id = ?
                  AND m.sender_user_id <> ?
                  AND m.deleted_at IS NULL
                  AND m.created_at > COALESCE(p.last_read_at, 'epoch'::timestamptz)
                """, Integer.class, actorUserId, tenantId, conversationId, actorUserId);
        return count == null ? 0 : count;
    }

    private void addAssignedWorkersAsParticipants(UUID tenantId, UUID actorUserId, UUID conversationId, UUID workOrderId) {
        jdbcTemplate.query("""
                SELECT DISTINCT u.id AS user_id, w.id AS worker_id
                FROM work_order_assignments woa
                JOIN workers w ON w.tenant_id = woa.tenant_id AND w.id = woa.worker_id
                JOIN app_users u ON u.id = w.user_id
                WHERE woa.tenant_id = ? AND woa.work_order_id = ?
                """, (rs) -> {
                    addParticipant(
                            tenantId,
                            conversationId,
                            rs.getObject("user_id", UUID.class),
                            rs.getObject("worker_id", UUID.class),
                            "worker",
                            actorUserId
                    );
                }, tenantId, workOrderId);
    }

    private void addParticipant(UUID tenantId, UUID conversationId, UUID userId, UUID workerId, String role, UUID actorUserId) {
        if (userId == null) {
            return;
        }
        jdbcTemplate.update("""
                INSERT INTO communication_participants (
                    conversation_id, tenant_id, user_id, worker_id, participant_role, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (conversation_id, user_id) DO UPDATE SET
                    worker_id = COALESCE(EXCLUDED.worker_id, communication_participants.worker_id),
                    participant_role = CASE
                        WHEN communication_participants.participant_role = 'operations' THEN communication_participants.participant_role
                        ELSE EXCLUDED.participant_role
                    END
                """, conversationId, tenantId, userId, workerId, role, actorUserId);
    }

    private Optional<ConversationDto> findConversation(UUID tenantId, UUID conversationId) {
        return jdbcTemplate.query("""
                SELECT c.id, c.channel_type::text AS channel_type, c.work_order_id, wo.work_order_number,
                       c.title, last_message.body AS last_message_preview,
                       COALESCE(c.last_message_at, c.created_at) AS last_message_at
                FROM communication_conversations c
                LEFT JOIN work_orders wo ON wo.tenant_id = c.tenant_id AND wo.id = c.work_order_id
                LEFT JOIN LATERAL (
                    SELECT m.body
                    FROM communication_messages m
                    WHERE m.tenant_id = c.tenant_id AND m.conversation_id = c.id AND m.deleted_at IS NULL
                    ORDER BY m.created_at DESC
                    LIMIT 1
                ) last_message ON true
                WHERE c.tenant_id = ? AND c.id = ?
                """, (rs, rowNum) -> mapConversationRow(rs, rowNum), tenantId, conversationId)
                .stream()
                .findFirst();
    }

    private ConversationDto mapConversationRow(ResultSet rs, int rowNum) throws SQLException {
        return new ConversationDto(
                rs.getObject("id", UUID.class),
                CommunicationChannelType.valueOf(rs.getString("channel_type")),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("title"),
                rs.getString("last_message_preview"),
                instant(rs, "last_message_at"),
                0,
                List.of()
        );
    }

    private void requireConversation(UUID tenantId, UUID conversationId) {
        if (findConversation(tenantId, conversationId).isEmpty()) {
            throw new ResourceNotFoundException("Conversation was not found.");
        }
    }

    private ConversationDto requireTenantConversationAccess(UUID tenantId, UUID actorUserId, UUID conversationId) {
        var conversation = findConversation(tenantId, conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Conversation was not found."));
        if (conversation.channelType() != CommunicationChannelType.WORKER_DIRECT) {
            return conversation;
        }
        var allowed = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM communication_participants p
                    WHERE p.tenant_id = ?
                      AND p.conversation_id = ?
                      AND p.user_id = ?
                )
                """, Boolean.class, tenantId, conversationId, actorUserId));
        if (!allowed) {
            throw new ResourceNotFoundException("Conversation was not found.");
        }
        return conversation;
    }

    private void validateTenantDirectWorkerRecipients(UUID tenantId, List<UUID> participantUserIds) {
        var recipients = uniqueIds(participantUserIds);
        if (recipients.size() != 1) {
            throw new BadRequestException("Select exactly one worker for a private worker chat.");
        }
        var fieldWorker = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM app_users u
                    JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id = ?
                    JOIN roles r ON r.id = utr.role_id
                    WHERE u.id = ?
                      AND u.status = 'ACTIVE'
                      AND r.code = 'FIELD_WORKER'
                )
                """, Boolean.class, tenantId, recipients.getFirst()));
        if (!fieldWorker) {
            throw new BadRequestException("Private worker chat can only be started with one active field worker.");
        }
    }

    private Optional<UUID> findWorkOrderConversation(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT id
                FROM communication_conversations
                WHERE tenant_id = ? AND work_order_id = ? AND channel_type = 'WORK_ORDER'::communication_channel_type
                LIMIT 1
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), tenantId, workOrderId)
                .stream()
                .findFirst();
    }

    private Optional<UUID> findWorkerOperationsConversation(UUID tenantId, UUID workerId) {
        return jdbcTemplate.query("""
                SELECT c.id
                FROM communication_conversations c
                JOIN communication_participants p
                  ON p.tenant_id = c.tenant_id
                 AND p.conversation_id = c.id
                 AND p.worker_id = ?
                WHERE c.tenant_id = ? AND c.channel_type = 'WORKER_OPERATIONS'::communication_channel_type
                ORDER BY c.created_at DESC
                LIMIT 1
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), workerId, tenantId)
                .stream()
                .findFirst();
    }

    private Optional<WorkerIdentity> workerIdentity(UUID tenantId, UUID userId, String email) {
        return jdbcTemplate.query("""
                SELECT w.id, COALESCE(u.display_name, w.display_name) AS display_name,
                       COALESCE(u.email::text, w.email::text, ?) AS email
                FROM workers w
                LEFT JOIN app_users u ON u.id = w.user_id
                WHERE w.tenant_id = ?
                  AND w.status <> 'TERMINATED'
                  AND (w.user_id = ? OR lower(w.email::text) = lower(?))
                ORDER BY CASE WHEN w.user_id = ? THEN 0 ELSE 1 END
                LIMIT 1
                """, (rs, rowNum) -> new WorkerIdentity(
                        rs.getObject("id", UUID.class),
                        rs.getString("display_name"),
                        rs.getString("email")
                ), email, tenantId, userId, email, userId)
                .stream()
                .findFirst();
    }

    private WorkerIdentity requireWorker(UUID tenantId, UUID userId, String email) {
        return workerIdentity(tenantId, userId, email)
                .orElseThrow(() -> new ResourceNotFoundException("Worker profile was not found for this login."));
    }

    private WorkerIdentity requireWorkerCanAccess(UUID tenantId, UUID userId, String email, UUID conversationId) {
        var worker = requireWorker(tenantId, userId, email);
        var allowed = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM communication_conversations c
                    WHERE c.tenant_id = ? AND c.id = ?
                      AND (
                        EXISTS (
                            SELECT 1 FROM communication_participants p
                            WHERE p.tenant_id = c.tenant_id
                              AND p.conversation_id = c.id
                              AND p.user_id = ?
                        )
                        OR (
                            c.channel_type = 'WORK_ORDER'::communication_channel_type
                            AND EXISTS (
                                SELECT 1 FROM work_order_assignments woa
                                WHERE woa.tenant_id = c.tenant_id
                                  AND woa.work_order_id = c.work_order_id
                                  AND woa.worker_id = ?
                            )
                        )
                      )
                )
                """, Boolean.class, tenantId, conversationId, userId, worker.id()));
        if (!allowed) {
            throw new ResourceNotFoundException("Conversation was not found.");
        }
        return worker;
    }

    private Optional<UUID> workerIdForUser(UUID tenantId, UUID userId) {
        return jdbcTemplate.query("""
                SELECT id
                FROM workers
                WHERE tenant_id = ? AND user_id = ?
                LIMIT 1
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), tenantId, userId)
                .stream()
                .findFirst();
    }

    private List<UUID> tenantOperationsUsers(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT DISTINCT u.id
                FROM app_users u
                JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id = ?
                JOIN roles r ON r.id = utr.role_id
                WHERE r.code IN ('TENANT_ADMIN', 'OPERATIONS')
                  AND u.status = 'ACTIVE'
                ORDER BY u.id
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), tenantId);
    }

    private Optional<WorkOrderSummary> workOrderSummary(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT work_order_number, title
                FROM work_orders
                WHERE tenant_id = ? AND id = ?
                """, (rs, rowNum) -> new WorkOrderSummary(
                        rs.getString("work_order_number"),
                        rs.getString("title")
                ), tenantId, workOrderId)
                .stream()
                .findFirst();
    }

    private String defaultTitle(CommunicationChannelType channelType) {
        return switch (channelType) {
            case WORKER_OPERATIONS -> "Operations chat";
            case WORKER_DIRECT -> "Worker chat";
            case ANNOUNCEMENT -> "Announcement";
            case WORK_ORDER -> "Work order chat";
        };
    }

    private String readableRole(String roles) {
        if (!StringUtils.hasText(roles)) {
            return "User";
        }
        if (roles.contains("FIELD_WORKER")) {
            return "Worker";
        }
        if (roles.contains("TENANT_ADMIN")) {
            return "Admin";
        }
        if (roles.contains("OPERATIONS")) {
            return "Operations";
        }
        if (roles.contains("FINANCE")) {
            return "Finance";
        }
        return "User";
    }

    private List<UUID> uniqueIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return new ArrayList<>(new LinkedHashSet<>(ids.stream().filter((id) -> id != null).toList()));
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record WorkerIdentity(UUID id, String displayName, String email) {
    }

    private record WorkOrderSummary(String workOrderNumber, String title) {
    }
}
