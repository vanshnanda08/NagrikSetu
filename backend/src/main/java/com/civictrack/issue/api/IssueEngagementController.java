package com.civictrack.issue.api;

import com.civictrack.issue.IssueAccessGuard;
import com.civictrack.issue.IssueEngagementService;
import com.civictrack.user.Actor;
import com.civictrack.user.Role;
import com.civictrack.user.auth.Actors;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/issues/{issueId}")
@RequiredArgsConstructor
public class IssueEngagementController {
    private final IssueEngagementService engagement;
    private final IssueAccessGuard guard;

    @GetMapping("/follow")
    @PreAuthorize("hasRole('CITIZEN')")
    public Map<String, Boolean> following(@PathVariable UUID issueId, Authentication authentication) {
        return Map.of("following", engagement.follows(issueId, actor(authentication).id()));
    }

    @PostMapping("/follow")
    @PreAuthorize("hasRole('CITIZEN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void follow(@PathVariable UUID issueId, Authentication authentication) {
        engagement.follow(issueId, actor(authentication).id());
    }

    @DeleteMapping("/follow")
    @PreAuthorize("hasRole('CITIZEN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfollow(@PathVariable UUID issueId, Authentication authentication) {
        engagement.unfollow(issueId, actor(authentication).id());
    }

    @GetMapping("/messages")
    @PreAuthorize("hasAnyRole('CITIZEN', 'STAFF', 'SUPERVISOR', 'ADMIN')")
    public List<IssueEngagementService.Message> messages(@PathVariable UUID issueId,
                                                          Authentication authentication) {
        Actor actor = actor(authentication);
        return engagement.messages(issueId, actor, privileged(actor) && guard.canAct(issueId, authentication));
    }

    public record MessageBody(@NotBlank @Size(min = 3, max = 2000) String body) {}

    @PostMapping("/messages")
    @PreAuthorize("hasAnyRole('CITIZEN', 'STAFF', 'SUPERVISOR', 'ADMIN')")
    public IssueEngagementService.Message post(@PathVariable UUID issueId,
                                                @Valid @RequestBody MessageBody body,
                                                Authentication authentication) {
        Actor actor = actor(authentication);
        return engagement.post(issueId, actor, privileged(actor) && guard.canAct(issueId, authentication), body.body());
    }

    private static Actor actor(Authentication authentication) {
        return Actors.from(authentication);
    }

    private static boolean privileged(Actor actor) {
        return actor.role() == Role.STAFF || actor.role() == Role.SUPERVISOR || actor.role() == Role.ADMIN;
    }
}
