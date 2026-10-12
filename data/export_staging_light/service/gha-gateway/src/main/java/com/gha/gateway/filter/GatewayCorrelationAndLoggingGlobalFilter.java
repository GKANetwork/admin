package com.gha.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Reactive GlobalFilter for GHA Spring Cloud Gateway.
 * 1. Generates or propagates X-Correlation-Id header for end-to-end debug tracing.
 * 2. Logs incoming Desktop Admin & Mobile App requests with active profile (dev/qa/prod).
 * 3. Forwards routing metadata downstream to lb://GHA-EVENT-SERVICE and lb://GHA-AUTH-SERVICE.
 */
@Component
public class GatewayCorrelationAndLoggingGlobalFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(GatewayCorrelationAndLoggingGlobalFilter.class);
    private static final String CORRELATION_HEADER = "X-Correlation-Id";

    private final String activeProfile;

    public GatewayCorrelationAndLoggingGlobalFilter(
            @Value("${spring.profiles.active:dev}") String activeProfile
    ) {
        this.activeProfile = activeProfile;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String existingCorrId = request.getHeaders().getFirst(CORRELATION_HEADER);
        String correlationId = (existingCorrId != null && !existingCorrId.isBlank())
                ? existingCorrId
                : "gha-gw-" + UUID.randomUUID().toString().substring(0, 8);

        String method = request.getMethod() != null ? request.getMethod().name() : "UNKNOWN";
        String path = request.getURI().getPath();
        String query = request.getURI().getRawQuery();

        log.debug("[GHA-GATEWAY] [profile={}] [corrId={}] Routing {} {}{}",
                activeProfile, correlationId, method, path, (query != null ? "?" + query : ""));

        ServerHttpRequest mutatedRequest = request.mutate()
                .header(CORRELATION_HEADER, correlationId)
                .header("X-GHA-Gateway-Profile", activeProfile)
                .build();

        exchange.getResponse().getHeaders().add(CORRELATION_HEADER, correlationId);

        long startTime = System.currentTimeMillis();
        return chain.filter(exchange.mutate().request(mutatedRequest).build())
                .doFinally(signalType -> {
                    long elapsedMs = System.currentTimeMillis() - startTime;
                    log.debug("[GHA-GATEWAY] [profile={}] [corrId={}] Completed {} {} in {}ms (status={})",
                            activeProfile, correlationId, method, path, elapsedMs,
                            exchange.getResponse().getStatusCode());
                });
    }

    @Override
    public int getOrder() {
        return -1;
    }
}
