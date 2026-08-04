package com.shivagri.notification.service;

import com.shivagri.notification.repository.WhatsAppMessageStatus;
import com.shivagri.notification.service.dto.DeliveryPage;
import com.shivagri.notification.service.dto.MessageStatusRecord;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Durable delivery history, keyed by wamid.
 *
 * <p>Writes are a single atomic upsert per callback: {@code $push} appends the raw
 * transition and {@code $max} advances the status rank. That ordering guarantee matters
 * because Meta does not promise webhook callbacks arrive in order — a naive
 * read-modify-write can regress a delivered message back to "sent".
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WhatsAppStatusStore {

    private static final String COLLECTION = "whatsapp_message_status";

    private final MongoTemplate mongoTemplate;

    public void record(MessageStatusRecord record) {
        int rank = WhatsAppMessageStatus.rankOf(record.status());

        Update update = new Update()
                .push("transitions", record)
                .max("statusRank", rank)
                .set("recipient", record.recipient())
                .set("lastUpdated", record.receivedAt())
                .setOnInsert("firstSeen", record.receivedAt());

        if (record.conversationCategory() != null) {
            update.set("conversationCategory", record.conversationCategory());
        }
        // Failure detail is sticky: keep it visible even if a later callback arrives.
        if (record.isFailure()) {
            update.set("errorCode", record.errorCode())
                    .set("errorTitle", record.errorTitle())
                    .set("errorDetails", record.errorDetails())
                    .set("errorHint", record.errorHint());
        }

        try {
            mongoTemplate.upsert(
                    Query.query(Criteria.where("_id").is(record.wamid())),
                    update,
                    WhatsAppMessageStatus.class);
        } catch (Exception ex) {
            // Losing a status row must never make us return non-200 to Meta.
            log.error("Failed to persist status for wamid={}: {}", record.wamid(), ex.getMessage(), ex);
        }
    }

    public WhatsAppMessageStatus find(String wamid) {
        return mongoTemplate.findById(wamid, WhatsAppMessageStatus.class);
    }

    /**
     * Server-side paginated listing, newest activity first.
     *
     * @param status optional filter on latest status (sent/delivered/read/failed)
     * @param search optional partial recipient match
     */
    public DeliveryPage page(int page, int limit, String status, String search) {
        int safePage = Math.max(page, 1);
        int safeLimit = Math.min(Math.max(limit, 1), 200);

        Query query = new Query();
        if (status != null && !status.isBlank()) {
            query.addCriteria(Criteria.where("statusRank").is(WhatsAppMessageStatus.rankOf(status)));
        }
        if (search != null && !search.isBlank()) {
            query.addCriteria(Criteria.where("recipient")
                    .regex(Pattern.compile(Pattern.quote(search.trim()))));
        }

        long total = mongoTemplate.count(query, WhatsAppMessageStatus.class);

        query.with(Sort.by(Sort.Direction.DESC, "lastUpdated"))
                .skip((long) (safePage - 1) * safeLimit)
                .limit(safeLimit);

        List<WhatsAppMessageStatus> rows = mongoTemplate.find(query, WhatsAppMessageStatus.class);
        int pages = (int) Math.ceil(total / (double) safeLimit);
        return new DeliveryPage(rows, total, safePage, safeLimit, pages);
    }

    /** Counters for the dashboard tiles. */
    public Map<String, Object> summary() {
        long total = mongoTemplate.count(new Query(), WhatsAppMessageStatus.class);

        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (int rank : List.of(WhatsAppMessageStatus.RANK_SENT,
                WhatsAppMessageStatus.RANK_DELIVERED,
                WhatsAppMessageStatus.RANK_READ,
                WhatsAppMessageStatus.RANK_FAILED)) {
            byStatus.put(WhatsAppMessageStatus.statusOf(rank),
                    mongoTemplate.count(
                            Query.query(Criteria.where("statusRank").is(rank)),
                            WhatsAppMessageStatus.class));
        }

        long delivered = byStatus.getOrDefault("delivered", 0L) + byStatus.getOrDefault("read", 0L);
        long failed = byStatus.getOrDefault("failed", 0L);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTracked", total);
        result.put("byStatus", byStatus);
        result.put("deliveredCount", delivered);
        result.put("failedCount", failed);
        result.put("deliveryRatePercent", total == 0 ? 0.0 : Math.round(delivered * 1000.0 / total) / 10.0);
        result.put("topFailureReasons", topFailureReasons());
        return result;
    }

    /** Failure counts grouped by Meta error code — names the systemic cause at a glance. */
    private List<Map<String, Object>> topFailureReasons() {
        List<Map<String, Object>> reasons = new ArrayList<>();
        try {
            List<WhatsAppMessageStatus> failures = mongoTemplate.find(
                    Query.query(Criteria.where("statusRank").is(WhatsAppMessageStatus.RANK_FAILED)),
                    WhatsAppMessageStatus.class);

            Map<Integer, long[]> counts = new LinkedHashMap<>();
            Map<Integer, WhatsAppMessageStatus> exemplar = new LinkedHashMap<>();
            for (WhatsAppMessageStatus f : failures) {
                if (f.getErrorCode() == null) continue;
                counts.computeIfAbsent(f.getErrorCode(), k -> new long[1])[0]++;
                exemplar.putIfAbsent(f.getErrorCode(), f);
            }
            counts.entrySet().stream()
                    .sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                    .limit(5)
                    .forEach(e -> {
                        WhatsAppMessageStatus sample = exemplar.get(e.getKey());
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("errorCode", e.getKey());
                        row.put("count", e.getValue()[0]);
                        row.put("title", sample.getErrorTitle());
                        row.put("hint", sample.getErrorHint());
                        reasons.add(row);
                    });
        } catch (Exception ex) {
            log.error("Failed to aggregate failure reasons: {}", ex.getMessage(), ex);
        }
        return reasons;
    }
}
