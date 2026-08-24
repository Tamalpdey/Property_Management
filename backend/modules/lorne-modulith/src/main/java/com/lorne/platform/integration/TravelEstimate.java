package com.lorne.platform.integration;

import java.time.Instant;

public record TravelEstimate(
        int minutes,
        Integer distanceMeters,
        String provider,
        Instant estimatedAt
) {
}
