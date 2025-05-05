package com.chatify.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();

        // Specific allowed origins for HTTP requests
        config.setAllowedOrigins(Arrays.asList(
                "https://chatifies.netlify.app",  // Your Netlify domain
                "http://localhost:5173",          // Local Vite development
                "http://localhost:3000"           // Alternative local development
        ));

        // Essential for WebSocket handshakes
        config.setAllowCredentials(true);

        // Other CORS configuration
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");
        config.setMaxAge(3600L); // Cache preflight response for 1 hour

        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}