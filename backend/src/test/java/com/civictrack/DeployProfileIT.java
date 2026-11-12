package com.civictrack;

import com.civictrack.sla.SlaProperties;
import com.civictrack.notification.MailProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The deploy profile must not compress the clock.
 *
 * <p>This guards a trap rather than a feature. Staff logins only exist because
 * {@code DemoAccountBootstrap} sets passwords on the seeded accounts, and that
 * bootstrap was originally gated on the {@code demo} profile -- which also sets
 * three-minute SLAs. Deploying with {@code demo} to get the logins would have
 * made every issue in the corpus read as overdue, and the public dashboard is
 * the screen this project exists to argue for.
 *
 * <p>If somebody later "simplifies" this by folding deploy back into demo, or
 * copies demo's timings into application-deploy.yml, this test fails and says
 * why. The failure mode it prevents is not a crash: it is a deployment that
 * works perfectly and reports false numbers.
 */
@ActiveProfiles({"test", "deploy"})
// The production cron overrides the disabled test cron. Close this context so
// its scheduled jobs cannot mutate another test's shared PostGIS fixtures.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DeployProfileIT extends IntegrationTestBase {

    private static final String DEPLOY_SIGNING_KEY = java.util.Base64.getEncoder()
            .encodeToString(new java.security.SecureRandom().generateSeed(48));

    @DynamicPropertySource
    static void deploymentSigningKey(DynamicPropertyRegistry registry) {
        // A deployment must not inherit application-test.yml's public fixture key.
        registry.add("civictrack.security.jwt.secret", () -> DEPLOY_SIGNING_KEY);
    }

    @Autowired private SlaProperties sla;
    @Autowired private MailProperties mail;

    @Test
    @DisplayName("the deployed release keeps deferred email delivery disabled")
    void deployKeepsDeferredEmailDisabled() {
        assertThat(mail.enabled()).isFalse();
    }

    @Test
    @DisplayName("the deploy profile leaves real SLA deadlines in place")
    void deployDoesNotCompressTheClock() {
        assertThat(sla.demoOverrideActive())
                .as("a deployed environment must judge departments on their real deadlines")
                .isFalse();
        assertThat(sla.demoOverrideHours()).isZero();
    }

    @Test
    @DisplayName("the deploy profile keeps the production sweep cadence and re-arm floor")
    void deployKeepsProductionTimings() {
        assertThat(sla.cron())
                .as("the twenty-second demo sweep is for a projector, not a deployment")
                .isEqualTo("0 */5 * * * *");
        assertThat(sla.rearmFloor())
                .as("the one-minute demo floor would hand crews deadlines nobody can meet")
                .isEqualTo(Duration.ofHours(2));
    }
}
