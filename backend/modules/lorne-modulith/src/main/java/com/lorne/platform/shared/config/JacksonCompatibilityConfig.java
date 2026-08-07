package com.lorne.platform.shared.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JacksonCompatibilityConfig {
    @Bean
    ObjectMapper legacyObjectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }
}
