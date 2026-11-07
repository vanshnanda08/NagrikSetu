package com.civictrack.issue;

import com.civictrack.issue.policy.TransitionContext;
import com.civictrack.user.Actor;
import com.civictrack.user.AppUser;
import com.civictrack.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * The staff-facing verbs, each of which is one transition.
 *
 * <p>This layer exists to assemble a {@link TransitionContext} -- read the
 * clock, look up the proposed assignee -- and then hand off to
 * {@link IssueStatusService}. It holds no rules of its own. That matters: if
 * "who may reject an issue" were decided here, the state machine would be
 * declarative in one file and imperative in another, and the second one would
 * win whenever they disagreed.
 */
@Service
@RequiredArgsConstructor
public class IssueLifecycleService {

    private final IssueRepository issues;
    private final UserRepository users;
    private final IssueStatusService statusService;
    private final Clock clock;

    @Transactional
    public Issue acknowledge(UUID issueId, Actor actor, String note) {
        Issue issue = load(issueId);
        return statusService.transition(issue, IssueStatus.ACKNOWLEDGED, actor,
                context().note(note).build());
    }

    @Transactional
    public Issue assign(UUID issueId, Actor actor, UUID assigneeId, String note) {
        Issue issue = load(issueId);
        AppUser assignee = users.findById(assigneeId).orElse(null);
        // A missing assignee is passed through with a null department rather
        // than throwing here, so that "no such user" and "user in the wrong
        // department" produce the same guard failure. Both are the same mistake
        // from the caller's point of view, and distinguishing them would let a
        // supervisor probe for which user ids exist.
        return statusService.transition(issue, IssueStatus.ASSIGNED, actor,
                context()
                        .assignee(assigneeId, assignee == null ? null : assignee.getDepartmentId())
                        .note(note)
                        .build());
    }

    @Transactional
    public Issue start(UUID issueId, Actor actor, String note) {
        Issue issue = load(issueId);
        IssueStatus to = IssueStatus.IN_PROGRESS;
        return statusService.transition(issue, to, actor, context().note(note).build());
    }

    /**
     * Staff claim a fix. The issue reaches PENDING_VERIFICATION and stops
     * there -- there is no staff path to RESOLVED at all, which is the whole
     * accountability claim of the project expressed as a missing table row.
     */
    @Transactional
    public Issue submitForVerification(UUID issueId, Actor actor, String proofPhotoUrl,
                                       String proofPhotoHash, String note) {
        Issue issue = load(issueId);
        if (proofPhotoHash != null && !proofPhotoHash.isBlank()
                && issues.existsByResolutionPhotoHash(proofPhotoHash)) {
            issue.flagForReview("REUSED_PROOF_PHOTO");
        }
        return statusService.transition(issue, IssueStatus.PENDING_VERIFICATION, actor,
                context().proofPhoto(proofPhotoUrl, proofPhotoHash).note(note).build());
    }

    /** Compatibility overload for internal workflow callers without a hash. */
    @Transactional
    public Issue submitForVerification(UUID issueId, Actor actor, String proofPhotoUrl, String note) {
        return submitForVerification(issueId, actor, proofPhotoUrl, null, note);
    }

    @Transactional
    public Issue reject(UUID issueId, Actor actor, String reason) {
        Issue issue = load(issueId);
        return statusService.transition(issue, IssueStatus.REJECTED, actor,
                context().note(reason).build());
    }

    /** Close only through the state machine; concurrent closure is serialized. */
    @Transactional
    public Issue close(UUID issueId, Actor actor, String reason) {
        Issue issue = issues.findByIdForUpdate(issueId).orElseThrow(() -> new IssueNotFoundException(issueId));
        return statusService.transition(issue, IssueStatus.CLOSED, actor,
                context().note(reason == null ? null : reason.strip()).build());
    }

    /**
     * One slice of the caller's own queue.
     *
     * <p>The department and ward scope come from the actor's token; the tab is
     * a view preference on top of that scope and can never widen it. That
     * ordering matters: {@code tab=all} means "everything in my scope", not
     * "everything".
     */
    @Transactional(readOnly = true)
    public List<IssueRepository.QueueRow> queue(Actor actor, QueueTab tab, int limit, int offset) {
        // A missing department must not turn staff scope into the SQL wildcard.
        // Ward officers are supervisors explicitly scoped to a ward across departments.
        if (!actor.isAdmin() && actor.departmentId() == null
                && (actor.role() != com.civictrack.user.Role.SUPERVISOR || actor.wardId() == null)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "A department assignment is required to access this work queue.");
        }
        // Administrators see the whole city; everybody else sees their own
        // scope, applied in SQL rather than by filtering afterwards so that
        // paging returns a full page of things the caller may actually act on.
        UUID departmentId = actor.isAdmin() ? null : actor.departmentId();
        UUID wardId = actor.isAdmin() ? null : actor.wardId();
        UUID assignedTo = tab == QueueTab.MINE ? actor.id() : null;
        boolean unassignedOnly = tab == QueueTab.UNASSIGNED;
        boolean toAssignOnly = tab == QueueTab.TO_ASSIGN;
        boolean readyToCloseOnly = tab == QueueTab.READY_TO_CLOSE;
        if (readyToCloseOnly && !actor.isAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("Only administrators can access the closure queue.");
        }
        return issues.findQueueRows(departmentId, wardId, assignedTo, unassignedOnly,
                                    toAssignOnly, readyToCloseOnly, limit, offset);
    }

    @Transactional(readOnly = true)
    public Issue get(UUID issueId) {
        return load(issueId);
    }

    private Issue load(UUID issueId) {
        return issues.findById(issueId).orElseThrow(() -> new IssueNotFoundException(issueId));
    }

    private TransitionContext.Builder context() {
        return TransitionContext.at(clock.instant());
    }
}
