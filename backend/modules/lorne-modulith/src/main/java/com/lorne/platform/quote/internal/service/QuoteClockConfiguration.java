package com.lorne.platform.quote.internal.service;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class QuoteClockConfiguration {
    @Bean Clock quoteClock() { return Clock.systemUTC(); }
}
