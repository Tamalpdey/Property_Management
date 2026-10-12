package com.lorne.platform.workorder.internal.service;

import com.lorne.platform.workorder.QuoteWorkOrderOperations;
import com.lorne.platform.workorder.QuoteWorkOrderRequest;
import com.lorne.platform.workorder.QuoteWorkOrderResult;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
class QuoteWorkOrderAdapter implements QuoteWorkOrderOperations {
    private final WorkOrderManagementService workOrderManagementService;

    QuoteWorkOrderAdapter(WorkOrderManagementService workOrderManagementService) {
        this.workOrderManagementService = workOrderManagementService;
    }

    @Override
    public QuoteWorkOrderResult createFromQuote(UUID tenantId, UUID actorUserId, QuoteWorkOrderRequest request) {
        var workOrder = workOrderManagementService.create(tenantId, actorUserId, new CreateWorkOrderRequest(
                request.propertyId(),
                request.serviceTypeId(),
                "SERVICE",
                null,
                List.of(),
                null,
                request.title(),
                request.description(),
                "TENANT_PORTAL",
                "CREATED",
                "NORMAL",
                null,
                null,
                request.requesterName(),
                request.requesterEmail(),
                request.requesterPhone(),
                null,
                null,
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                false,
                null
        ));
        return new QuoteWorkOrderResult(workOrder.id(), workOrder.workOrderNumber());
    }
}
