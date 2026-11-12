package com.civictrack.common.generation;

import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import static org.assertj.core.api.Assertions.assertThat;

class GenerationScopeTest {
    @Test void existingEvaluationIdentitiesAndReferencesStayCompatible() {
        try(var scope=GenerationScope.open(42,Instant.parse("2026-10-01T00:00:00Z"))) {
            assertThat(GenerationScope.nextUuid()).isEqualTo(UUID.fromString("0ef95cb8-5082-3d5d-87d4-01245b656715"));
            assertThat(GenerationScope.publicRef(()->"ordinary")).isEqualTo("CT-2026-S000001");
        }
    }
    @Test void datedRefreshKeepsIdentitiesAndDoesNotMoveAnotherThreadsClock() {
        Instant normal=Instant.parse("2020-01-01T00:00:00Z");Clock clock=GenerationScope.clock(Clock.fixed(normal,ZoneOffset.UTC));UUID first;
        try(var scope=GenerationScope.dataset("thapar-demo-v2",731109,Instant.parse("2026-11-10T20:00:00Z"))) {
            first=GenerationScope.nextUuid();scope.at(Instant.parse("2026-08-13T10:17:00Z"));
            assertThat(clock.instant()).isEqualTo(Instant.parse("2026-08-13T10:17:00Z"));
            assertThat(CompletableFuture.supplyAsync(clock::instant).join()).isEqualTo(normal);
            assertThat(GenerationScope.publicRef(()->"ordinary")).isEqualTo("CT-2026-D000001");
        }
        assertThat(clock.instant()).isEqualTo(normal);
        try(var scope=GenerationScope.dataset("thapar-demo-v2",731109,Instant.parse("2026-11-14T20:00:00Z"))) {
            assertThat(GenerationScope.nextUuid()).isEqualTo(first);
        }
        assertThat(GenerationScope.publicRef(()->"ordinary")).isEqualTo("ordinary");
    }
}
