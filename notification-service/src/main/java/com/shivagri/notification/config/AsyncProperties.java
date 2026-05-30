package com.shivagri.notification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "notification.async")
public class AsyncProperties {
    private int corePoolSize = 4;
    private int maxPoolSize = 16;
    private int queueCapacity = 200;
    private String threadNamePrefix = "notif-async-";
}
