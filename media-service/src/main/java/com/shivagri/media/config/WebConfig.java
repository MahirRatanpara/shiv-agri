package com.shivagri.media.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:4200",
                        "http://localhost:80",
                        "https://shivagri.com",
                        "https://www.shivagri.com",
                        // Native app WebView origins (Capacitor): Android serves the
                        // app from http(s)://localhost, iOS from capacitor://localhost.
                        // Must be whitelisted so the mobile app can call media endpoints.
                        "http://localhost",
                        "https://localhost",
                        "capacitor://localhost"
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
