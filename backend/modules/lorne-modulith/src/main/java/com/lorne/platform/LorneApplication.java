package com.lorne.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.lorne.platform")
@ConfigurationPropertiesScan
@EnableScheduling
public class LorneApplication {
    public static void main(String[] args) {
        SpringApplication.run(LorneApplication.class, args);
    }
}
