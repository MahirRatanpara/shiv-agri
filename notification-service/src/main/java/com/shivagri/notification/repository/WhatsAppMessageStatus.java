package com.shivagri.notification.repository;

import com.shivagri.notification.service.dto.MessageStatusRecord;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

/**
 * One outbound message and everything Meta has told us about it.
 *
 * <p>Keyed by wamid so repeated status callbacks for the same message fold into a
 * single row rather than accumulating duplicates.
 */
@Getter
@Setter
@Document(collection = "whatsapp_message_status")
public class WhatsAppMessageStatus {

    @Id
    private String wamid;

    @Indexed
    private String recipient;

    /**
     * Highest status reached, as a rank rather than a label, so out-of-order webhook
     * delivery cannot regress a message from "delivered" back to "sent".
     * 1=sent, 2=delivered, 3=read, 9=failed.
     */
    @Indexed
    private int statusRank;

    private String conversationCategory;

    private Integer errorCode;
    private String errorTitle;
    private String errorDetails;
    private String errorHint;

    private Instant firstSeen;

    @Indexed
    private Instant lastUpdated;

    private List<MessageStatusRecord> transitions;

    public static final int RANK_SENT = 1;
    public static final int RANK_DELIVERED = 2;
    public static final int RANK_READ = 3;
    public static final int RANK_FAILED = 9;

    public static int rankOf(String status) {
        if (status == null) return 0;
        return switch (status.toLowerCase()) {
            case "sent" -> RANK_SENT;
            case "delivered" -> RANK_DELIVERED;
            case "read" -> RANK_READ;
            case "failed" -> RANK_FAILED;
            default -> 0;
        };
    }

    public static String statusOf(int rank) {
        return switch (rank) {
            case RANK_SENT -> "sent";
            case RANK_DELIVERED -> "delivered";
            case RANK_READ -> "read";
            case RANK_FAILED -> "failed";
            default -> "unknown";
        };
    }

    public String getLatestStatus() {
        return statusOf(statusRank);
    }
}
