package com.civictrack.notification;

import com.civictrack.category.Category;
import com.civictrack.category.CategoryRepository;
import com.civictrack.issue.Issue;
import com.civictrack.issue.IssueTransitioned;
import com.civictrack.verification.VerificationProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Turns status changes into messages for the people they concern.
 *
 * <p>A plain {@code @EventListener}, so it runs inside the transition's own
 * transaction: the notification and the change it announces commit together
 * or not at all. Idempotency therefore comes for free from the state machine
 * -- a transition happens once, so its notifications are written once, and a
 * sweep that re-runs and finds nothing to settle writes nothing.
 *
 * <p>Only four transitions notify. The intermediate staff steps --
 * acknowledged, assigned, started -- are visible on the issue's public
 * timeline, and a message for each would teach a citizen to ignore the one
 * that needs an answer from them.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notifications;
    private final CategoryRepository categories;
    private final VerificationProperties verificationProps;
    private final com.civictrack.user.UserRepository users;
    private final MailDelivery mail;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final java.time.Clock clock;

    @EventListener
    public void onTransition(IssueTransitioned event) {
        Issue issue = event.issue();
        String what = categories.findById(issue.getCategoryCode())
                .map(Category::getDisplayName).orElse("Issue");
        String ref = issue.getPublicRef();

        switch (event.to()) {
            case PENDING_VERIFICATION -> send(
                    notifications.findReporterIds(issue.getId(), true), issue,
                    NotificationType.VERIFY_REQUESTED,
                    "Is it fixed? " + what + " " + ref,
                    "The department says this is fixed and has posted a photo. You reported it, "
                    + "so you decide. If nobody objects within " + verificationProps.timeoutHours()
                    + " hours, it counts as fixed.");

            case RESOLVED -> send(
                    transitionAudience(issue.getId()), issue,
                    NotificationType.RESOLVED,
                    "Resolved: " + what + " " + ref,
                    issue.isResolvedWithoutVerification()
                            ? "Nobody answered within " + verificationProps.timeoutHours()
                              + " hours, so this closed without a citizen confirming it. If the "
                              + "problem is still there, report it again."
                            : "The people who reported this confirmed the fix.");

            case REOPENED -> {
                Set<UUID> recipients = new LinkedHashSet<>(
                        transitionAudience(issue.getId()));
                // The crew whose fix did not hold hears about it too -- they
                // are the ones with something to do next.
                if (issue.getAssignedTo() != null) {
                    recipients.add(issue.getAssignedTo());
                }
                send(List.copyOf(recipients), issue, NotificationType.REOPENED,
                        "Reopened: " + what + " " + ref,
                        event.note() == null ? "This issue has been reopened." : event.note() + ".");
            }

            // A merge closes the duplicate out as REJECTED (DD-063), but to the
            // person who reported it nothing was turned down: their report now
            // counts towards the other ticket. "Not taken forward" would be a
            // false statement to them, so a merge says what happened instead.
            case REJECTED -> send(
                    transitionAudience(issue.getId()), issue,
                    NotificationType.REJECTED,
                    issue.getMergedIntoId() != null
                            ? "Joined with another report: " + what + " " + ref
                            : "Not taken forward: " + what + " " + ref,
                    event.note());

            default -> {
                // No message. See the class comment.
            }
        }
    }

    /** Used by the clarification thread, which is not itself a status transition. */
    public void sendDirect(List<UUID> userIds, Issue issue, NotificationType type,
                           String title, String body) {
        send(userIds, issue, type, title, body);
    }

    private List<UUID> transitionAudience(UUID issueId) {
        Set<UUID> recipients = new LinkedHashSet<>(notifications.findReporterIds(issueId, false));
        recipients.addAll(jdbc.queryForList("SELECT user_id FROM issue_followers WHERE issue_id=?",
                UUID.class, issueId));
        return List.copyOf(recipients);
    }

    private void send(List<UUID> userIds, Issue issue, NotificationType type, String title, String body) {
        if (userIds.isEmpty()) {
            return;
        }
        // Honour switched-off preferences (blueprint 3.13). A request to verify a
        // fix is never skipped: silence on a verification round counts as
        // agreement, so it cannot be muted (see ProfileService.MUTABLE).
        Set<UUID> muted = type == NotificationType.VERIFY_REQUESTED
                ? Set.of()
                : Set.copyOf(users.findIdsMuting(userIds, type.name()));
        List<UUID> recipients = userIds.stream().filter(id -> !muted.contains(id)).toList();
        if (recipients.isEmpty()) {
            return;
        }
        notifications.saveAll(recipients.stream()
                .map(uid -> Notification.of(uid, issue.getId(), type, title, body,
                        clock.instant()))
                .toList());
        for (UUID uid : recipients) {
            jdbc.queryForList("SELECT email FROM users WHERE id = ? AND active AND email_notifications AND email IS NOT NULL",
                    String.class, uid).forEach(email -> mail.enqueue(email, title,
                    (body == null ? "" : body) + "\n\n" + mail.publicUrl() + "/issues/" + issue.getId()));
        }
    }
}
