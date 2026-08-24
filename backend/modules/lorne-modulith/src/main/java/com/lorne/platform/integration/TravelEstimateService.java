package com.lorne.platform.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TravelEstimateService {
    private static final Logger LOGGER = LoggerFactory.getLogger(TravelEstimateService.class);

    private final TravelEstimateProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public TravelEstimateService(TravelEstimateProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.timeoutMs()))
                .build();
    }

    public boolean enabled() {
        return properties.enabled() && !blank(properties.apiKey());
    }

    public Optional<TravelEstimate> estimateDrivingTime(String originAddress, String destinationAddress) {
        return estimateDrivingTime(originAddress, destinationAddress, null);
    }

    public Optional<TravelEstimate> estimateDrivingTime(
            String originAddress,
            String destinationAddress,
            Instant preferredDepartureAt
    ) {
        if (!enabled() || blank(originAddress) || blank(destinationAddress)) {
            return Optional.empty();
        }
        try {
            var payload = objectMapper.writeValueAsString(requestPayload(originAddress, destinationAddress, preferredDepartureAt));
            var request = HttpRequest.newBuilder(URI.create(properties.endpoint()))
                    .timeout(Duration.ofMillis(properties.timeoutMs()))
                    .header("Content-Type", "application/json")
                    .header("X-Goog-Api-Key", properties.apiKey())
                    .header("X-Goog-FieldMask", "routes.duration,routes.distanceMeters,routes.staticDuration")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOGGER.warn("travel_estimate_failed provider={} status={}", properties.provider(), response.statusCode());
                return Optional.empty();
            }
            return parseEstimate(response.body());
        } catch (Exception ex) {
            LOGGER.warn("travel_estimate_failed provider={} type={} message={}", properties.provider(), ex.getClass().getSimpleName(), ex.getMessage());
            return Optional.empty();
        }
    }

    private ObjectNode requestPayload(String originAddress, String destinationAddress, Instant preferredDepartureAt) {
        var root = objectMapper.createObjectNode();
        root.putObject("origin").put("address", originAddress.trim());
        root.putObject("destination").put("address", destinationAddress.trim());
        root.put("travelMode", "DRIVE");
        root.put("routingPreference", properties.routingPreference());
        if ("TRAFFIC_AWARE_OPTIMAL".equalsIgnoreCase(properties.routingPreference())) {
            root.put("trafficModel", properties.trafficModel());
        }

        var modifiers = root.putObject("routeModifiers");
        modifiers.put("avoidTolls", properties.avoidTolls());
        modifiers.put("avoidHighways", properties.avoidHighways());
        modifiers.put("avoidFerries", properties.avoidFerries());

        departureAt(preferredDepartureAt).ifPresent(departureAt -> root.put("departureTime", departureAt.toString()));
        return root;
    }

    private Optional<Instant> departureAt(Instant preferredDepartureAt) {
        var now = Instant.now();
        if (preferredDepartureAt == null || preferredDepartureAt.isBefore(now.plusSeconds(60))) {
            return Optional.of(now.plusSeconds(60));
        }
        return Optional.of(preferredDepartureAt);
    }

    private Optional<TravelEstimate> parseEstimate(String body) throws java.io.IOException {
        JsonNode route = objectMapper.readTree(body).path("routes").path(0);
        if (route.isMissingNode()) {
            return Optional.empty();
        }
        var minutes = durationMinutes(route.path("duration").asText(null));
        if (minutes == null) {
            return Optional.empty();
        }
        var distanceMeters = route.path("distanceMeters").isNumber() ? route.path("distanceMeters").asInt() : null;
        return Optional.of(new TravelEstimate(minutes, distanceMeters, properties.provider(), Instant.now()));
    }

    private Integer durationMinutes(String duration) {
        if (duration == null || !duration.endsWith("s")) {
            return null;
        }
        try {
            var seconds = Long.parseLong(duration.substring(0, duration.length() - 1));
            return Math.max(1, (int) Math.ceil(seconds / 60.0));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
