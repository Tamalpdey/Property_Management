package com.lorne.platform.shared.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CommonOpenApiConfig {
    @Bean
    OpenAPI lorneOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Lorne Property Management API")
                        .version("1.0.0")
                        .description("Tenant-aware property maintenance platform API"));
    }
}
