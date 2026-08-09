package com.lorne.platform.fieldwork.internal.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class WorkerShiftClockAutoClockOutScheduler {
    private static final Logger log = LoggerFactory.getLogger(WorkerShiftClockAutoClockOutScheduler.class);

    private final WorkerShiftClockService workerShiftClockService;

    public WorkerShiftClockAutoClockOutScheduler(WorkerShiftClockService workerShiftClockService) {
        this.workerShiftClockService = workerShiftClockService;
    }

    @Scheduled(
            initialDelayString = "${lorne.worker-clock.auto-clock-out.initial-delay-ms:120000}",
            fixedDelayString = "${lorne.worker-clock.auto-clock-out.fixed-delay-ms:300000}"
    )
    public void autoClockOutForgottenShifts() {
        var closed = workerShiftClockService.autoClockOutForgottenShifts();
        if (closed > 0) {
            log.info("Auto clocked out {} forgotten worker shift(s).", closed);
        }
    }
}
