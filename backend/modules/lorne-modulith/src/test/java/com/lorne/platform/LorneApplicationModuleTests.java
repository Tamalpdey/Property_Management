package com.lorne.platform;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class LorneApplicationModuleTests {
    private static final ApplicationModules MODULES = ApplicationModules.of(LorneApplication.class);

    @Test
    void verifiesModularStructure() {
        MODULES.verify();
    }
}
