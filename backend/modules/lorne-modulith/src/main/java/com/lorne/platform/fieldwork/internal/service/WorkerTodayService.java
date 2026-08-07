package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.fieldwork.internal.dto.WorkerTodayResponse;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class WorkerTodayService {
    public WorkerTodayResponse today() {
        return new WorkerTodayResponse(
                new WorkerTodayResponse.WorkerJob(
                        "Spring cleanup",
                        "24 Lorne Ave",
                        "24 Lorne Ave, Toronto, ON",
                        "10:30 AM - 12:00 PM",
                        "Front yard and side path. Before/after photos required.",
                        List.of("Confirm access", "Complete cleanup", "Capture before photos", "Capture after photos")
                ),
                List.of(
                        new WorkerTodayResponse.WorkerStep("ready", "Ready", "pi pi-check-circle"),
                        new WorkerTodayResponse.WorkerStep("travel", "Travel", "pi pi-map"),
                        new WorkerTodayResponse.WorkerStep("onsite", "On site", "pi pi-map-marker"),
                        new WorkerTodayResponse.WorkerStep("work", "Work", "pi pi-wrench"),
                        new WorkerTodayResponse.WorkerStep("photos", "Photos", "pi pi-camera"),
                        new WorkerTodayResponse.WorkerStep("complete", "Done", "pi pi-verified")
                ),
                List.of(
                        new WorkerTodayResponse.QuickAction("Add photo", "pi pi-camera", "secondary"),
                        new WorkerTodayResponse.QuickAction("Start break", "pi pi-pause", "secondary"),
                        new WorkerTodayResponse.QuickAction("Report issue", "pi pi-exclamation-triangle", "warn")
                )
        );
    }
}
