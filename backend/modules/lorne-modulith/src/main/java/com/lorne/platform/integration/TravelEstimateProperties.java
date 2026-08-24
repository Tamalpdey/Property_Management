package com.lorne.platform.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lorne.maps.travel-estimates")
public record TravelEstimateProperties(
        boolean enabled,
        String provider,
        String apiKey,
        String endpoint,
        String routingPreference,
        String trafficModel,
        boolean avoidTolls,
        boolean avoidHighways,
        boolean avoidFerries,
        int timeoutMs
) {
    private static final String DEFAULT_PROVIDER = "GOOGLE_MAPS";
    private static final String DEFAULT_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
    private static final String DEFAULT_ROUTING_PREFERENCE = "TRAFFIC_AWARE_OPTIMAL";
    private static final String DEFAULT_TRAFFIC_MODEL = "BEST_GUESS";
    private static final int DEFAULT_TIMEOUT_MS = 2500;

    public TravelEstimateProperties {
        provider = provider == null || provider.isBlank() ? DEFAULT_PROVIDER : provider.trim();
        endpoint = endpoint == null || endpoint.isBlank() ? DEFAULT_ENDPOINT : endpoint.trim();
        routingPreference = routingPreference == null || routingPreference.isBlank()
                ? DEFAULT_ROUTING_PREFERENCE
                : routingPreference.trim();
        trafficModel = trafficModel == null || trafficModel.isBlank() ? DEFAULT_TRAFFIC_MODEL : trafficModel.trim();
        timeoutMs = timeoutMs <= 0 ? DEFAULT_TIMEOUT_MS : timeoutMs;
    }
}
