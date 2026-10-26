package com.civictrack.moderation;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Limits on what a supervisor may do to a cluster.
 *
 * <p>{@code reassignMaxDistanceM} is the ward guard for reassigning an issue to
 * another ward: its centroid must lie within this distance of the target ward's
 * boundary. A ward is where the problem physically is, and it decides which
 * ward officer an escalation reaches, so reassignment exists for the cases the
 * geography genuinely leaves ambiguous -- a pin that fell either side of a
 * boundary line -- and not for moving a problem to a ward it is nowhere near.
 */
@ConfigurationProperties(prefix = "civictrack.moderation")
public record ModerationProperties(
        @DefaultValue("300") double reassignMaxDistanceM
) {
}
