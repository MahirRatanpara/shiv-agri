package com.shivagri.notification.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@RequiredArgsConstructor
public class AsyncConfig {

    private final AsyncProperties props;

    @Bean(name = "notificationExecutor")
    public Executor notificationExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(props.getCorePoolSize());
        exec.setMaxPoolSize(props.getMaxPoolSize());
        exec.setQueueCapacity(props.getQueueCapacity());
        exec.setThreadNamePrefix(props.getThreadNamePrefix());
        exec.setWaitForTasksToCompleteOnShutdown(true);
        exec.setAwaitTerminationSeconds(30);
        exec.initialize();
        return exec;
    }
}
