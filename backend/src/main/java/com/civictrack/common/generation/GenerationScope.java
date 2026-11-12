package com.civictrack.common.generation;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;
import java.util.function.Supplier;

/** Thread-confined, explicitly opened only by a reproducible seed run. */
public final class GenerationScope implements AutoCloseable {
    private static final ThreadLocal<GenerationScope> CURRENT = new ThreadLocal<>();
    private final String namespace;
    private final Instant referenceTime;
    private Instant currentTime;
    private final String ticketPrefix;
    private long idSequence;
    private long ticketSequence;

    private GenerationScope(long seed, Instant referenceTime) {
        this.namespace = "civictrack-seed-v1:" + seed + ":" + referenceTime;
        this.referenceTime = referenceTime;
        this.currentTime = referenceTime;
        this.ticketPrefix = "S";
    }

    private GenerationScope(String dataset, long seed, Instant referenceTime) {
        if (!dataset.matches("[a-z0-9-]{1,60}")) throw new IllegalArgumentException("Invalid dataset namespace");
        this.namespace = "civictrack-dataset-v2:" + dataset + ":" + seed;
        this.referenceTime = referenceTime;
        this.currentTime = referenceTime;
        this.ticketPrefix = "D";
    }

    /** Isolated dataset builders keep identities stable when the reference date advances. */
    public static GenerationScope dataset(String name, long seed, Instant referenceTime) {
        if (CURRENT.get() != null) throw new IllegalStateException("Nested seed scope");
        GenerationScope scope = new GenerationScope(name, seed, referenceTime);
        CURRENT.set(scope);
        return scope;
    }

    /** Only this thread's injected clock changes; ordinary application clocks stay real. */
    public void at(Instant instant) {
        if (CURRENT.get() != this) throw new IllegalStateException("Inactive generation scope");
        this.currentTime = instant;
    }

    public static GenerationScope open(long seed, Instant referenceTime) {
        if (CURRENT.get() != null) throw new IllegalStateException("Nested seed scope");
        GenerationScope scope = new GenerationScope(seed, referenceTime);
        CURRENT.set(scope);
        return scope;
    }

    public static UUID nextUuid() {
        GenerationScope scope = CURRENT.get();
        return scope == null ? UUID.randomUUID() : UUID.nameUUIDFromBytes(
                (scope.namespace + ":" + ++scope.idSequence).getBytes(StandardCharsets.UTF_8));
    }

    public static String publicRef(Supplier<String> normal) {
        GenerationScope scope = CURRENT.get();
        // 'S' keeps seed tickets distinct from the database's ordinary sequence.
        return scope == null ? normal.get() : "CT-" + scope.referenceTime.atZone(ZoneId.of("UTC")).getYear()
                + "-" + scope.ticketPrefix + String.format(java.util.Locale.ROOT, "%06d", ++scope.ticketSequence);
    }

    public static Clock clock(Clock normal) {
        return new Clock() {
            @Override public ZoneId getZone() { return normal.getZone(); }
            @Override public Clock withZone(ZoneId zone) { return clock(normal.withZone(zone)); }
            @Override public Instant instant() {
                GenerationScope scope = CURRENT.get();
                return scope == null ? normal.instant() : scope.currentTime;
            }
        };
    }

    @Override public void close() { CURRENT.remove(); }
}
