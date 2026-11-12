package com.civictrack.user;

import com.civictrack.user.auth.DeploySigningKeyGuard;
import com.civictrack.user.auth.JwtProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.security.SecureRandom;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/** Loads the real application YAML/profile without requiring a datasource. */
class DeploySigningKeyGuardTest {
    private final ApplicationContextRunner deployment = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Settings.class, DeploySigningKeyGuard.class)
            .withPropertyValues("spring.profiles.active=deploy");

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JwtProperties.class)
    static class Settings {}

    @Test
    void missingDeploymentKeyFailsInsteadOfUsingTheYamlDevelopmentFallback() {
        deployment.run(context -> assertThat(context.getStartupFailure())
                .hasRootCauseInstanceOf(IllegalStateException.class)
                .hasStackTraceContaining("The deploy profile requires a private JWT signing key"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "dev-only-secret-change-me-in-every-real-deployment",
            "test-only-signing-secret-at-least-32-bytes-long",
            "seed-run-only-not-a-real-secret-do-not-deploy-this-value",
            " dev-only-secret-change-me-in-every-real-deployment "
    })
    void explicitPublicDefaultsAlsoFail(String key) {
        deployment.withPropertyValues("JWT_SECRET=" + key).run(context ->
                assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(IllegalStateException.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "too-short"})
    void blankOrShortDeploymentKeysFail(String key) {
        deployment.withPropertyValues("JWT_SECRET=" + key).run(context ->
                assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(IllegalStateException.class));
    }

    @Test
    void generatedDeploymentKeyStartsAndIsUsedUnchanged() {
        String key = Base64.getEncoder().encodeToString(new SecureRandom().generateSeed(48));
        deployment.withPropertyValues("JWT_SECRET=" + key).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(DeploySigningKeyGuard.class);
            assertThat(context.getBean(JwtProperties.class).secret()).isEqualTo(key);
        });
    }

    @Test
    void addingTheDemoProfileDoesNotBypassDeploymentValidation() {
        deployment.withPropertyValues("spring.profiles.active=deploy,demo").run(context ->
                assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(IllegalStateException.class));
    }

    @Test
    void ordinaryLocalDevelopmentKeepsItsExplicitlyDocumentedFallback() {
        deployment.withPropertyValues("spring.profiles.active=local").run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(DeploySigningKeyGuard.class);
            assertThat(context.getBean(JwtProperties.class).secret())
                    .isEqualTo("dev-only-secret-change-me-in-every-real-deployment");
        });
    }
}
