package com.civictrack.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.HttpStatusCode;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;

/** RFC 7807 bodies for failures that happen before a controller is entered. */
@Component
@RequiredArgsConstructor
public class SecurityProblemHandlers {
    private static final String BASE = "https://civictrack.example/problems/";
    private final ObjectMapper mapper;

    public AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, exception) -> {
            response.setHeader("WWW-Authenticate", "Bearer");
            write(response, 401, "Authentication required",
                    "Sign in and try this request again.", "authentication-required");
        };
    }

    public AccessDeniedHandler accessDeniedHandler() {
        return (request, response, exception) -> write(response, 403, "Access denied",
                "Your account is not permitted to perform this action.", "access-denied");
    }

    private void write(HttpServletResponse response, int status, String title,
                       String detail, String type) throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail);
        problem.setTitle(title);
        problem.setType(URI.create(BASE + type));
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), problem);
    }
}
