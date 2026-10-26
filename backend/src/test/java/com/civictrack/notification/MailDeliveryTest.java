package com.civictrack.notification;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MailDeliveryTest {

    @Test
    void brevoDeliversPendingMailOverHttpsAndRedactsTheStoredBody() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        @SuppressWarnings("unchecked") ObjectProvider<JavaMailSender> smtp = mock(ObjectProvider.class);
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MailProperties properties = new MailProperties(true, "brevo", "verified@example.test",
                "NagrikSetu", "test-api-key", "https://api.brevo.test/v3/smtp/email");
        MailDelivery delivery = new MailDelivery(jdbc, smtp, properties, builder,
                "https://civic-track-six.vercel.app/");
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of(
                "id", 7L,
                "recipient", "citizen@example.test",
                "subject", "Reset your NagrikSetu password",
                "body", "Use this private reset link")));

        server.expect(once(), requestTo("https://api.brevo.test/v3/smtp/email"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("api-key", "test-api-key"))
                .andExpect(jsonPath("$.sender.email").value("verified@example.test"))
                .andExpect(jsonPath("$.to[0].email").value("citizen@example.test"))
                .andExpect(jsonPath("$.textContent").value("Use this private reset link"))
                .andRespond(withSuccess("{\"messageId\":\"test\"}", org.springframework.http.MediaType.APPLICATION_JSON));

        delivery.deliver();

        server.verify();
        verify(jdbc).update("UPDATE mail_outbox SET sent_at = now(), body = '[Delivered]', attempts = attempts + 1 WHERE id = ?", 7L);
        org.assertj.core.api.Assertions.assertThat(delivery.publicUrl())
                .isEqualTo("https://civic-track-six.vercel.app");
    }
}
