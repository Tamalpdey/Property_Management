package com.lorne.platform.fieldwork.internal.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lorne.worker-clock.auto-clock-out")
public class WorkerShiftClockAutoClockOutProperties {
    private boolean enabled = true;
    private int graceMinutes = 60;
    private int maxOpenHours = 16;

    public boolean enabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int graceMinutes() {
        return Math.max(0, graceMinutes);
    }

    public void setGraceMinutes(int graceMinutes) {
        this.graceMinutes = graceMinutes;
    }

    public int maxOpenHours() {
        return Math.max(1, maxOpenHours);
    }

    public void setMaxOpenHours(int maxOpenHours) {
        this.maxOpenHours = maxOpenHours;
    }
}
