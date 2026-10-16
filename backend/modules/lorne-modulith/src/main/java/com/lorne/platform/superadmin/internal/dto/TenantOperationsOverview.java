package com.lorne.platform.superadmin.internal.dto;

import java.time.Instant;

public record TenantOperationsOverview(int properties, int activeWorkers, int openWorkOrders, int completedWorkOrders,
                                      int unresolvedTickets, int resolvedTickets, Instant lastLoginAt) { }
