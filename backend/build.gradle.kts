plugins {
    java
    id("org.springframework.boot") version "4.1.0" apply false
    id("io.spring.dependency-management") version "1.1.7" apply false
}

group = "com.lorne.platform"
version = "1.0.0-SNAPSHOT"

java {
    toolchain { languageVersion = JavaLanguageVersion.of(25) }
}

repositories { mavenCentral() }

fun loadEnvFile(): Map<String, String> {
    val configuredEnvFile = System.getProperty("env.file") ?: System.getenv("ENV_FILE")
    val envFile = configuredEnvFile
        ?.let { rootProject.file(it) }
        ?: rootProject.file(".env.local")
    if (!envFile.exists()) return emptyMap()

    return envFile.readLines()
        .filter { it.isNotBlank() && !it.startsWith("#") && it.contains('=') }
        .associate { line ->
            val index = line.indexOf('=')
            line.substring(0, index).trim() to line.substring(index + 1).trim()
        }
}

extra["mapstructVersion"] = "1.6.3"
extra["springdocVersion"] = "3.0.2"
extra["testcontainersVersion"] = "1.20.4"
extra["lombokVersion"] = "1.18.38"

subprojects {
    apply(plugin = "java")
    apply(plugin = "org.springframework.boot")
    apply(plugin = "io.spring.dependency-management")

    group = "com.lorne.platform"
    version = "1.0.0-SNAPSHOT"

    java {
        toolchain { languageVersion = JavaLanguageVersion.of(25) }
        sourceCompatibility = JavaVersion.VERSION_25
        targetCompatibility = JavaVersion.VERSION_25
    }

    repositories { mavenCentral() }

    dependencies {
        compileOnly("org.projectlombok:lombok:${property("lombokVersion")}")
        annotationProcessor("org.projectlombok:lombok:${property("lombokVersion")}")
        testCompileOnly("org.projectlombok:lombok:${property("lombokVersion")}")
        testAnnotationProcessor("org.projectlombok:lombok:${property("lombokVersion")}")

        implementation("org.mapstruct:mapstruct:${property("mapstructVersion")}")
        annotationProcessor("org.projectlombok:lombok-mapstruct-binding:0.2.0")
        annotationProcessor("org.mapstruct:mapstruct-processor:${property("mapstructVersion")}")

        implementation("org.springframework.boot:spring-boot-starter-validation")

        testImplementation("org.springframework.boot:spring-boot-starter-test")
    }

    tasks.withType<JavaCompile> {
        options.compilerArgs.addAll(listOf("-parameters"))
    }

    tasks.withType<Test> {
        useJUnitPlatform()
        systemProperty("spring.profiles.active", "test")
    }
}

configure(listOf(project(":lorne-common"))) {
    apply(plugin = "java-library")

    dependencies {
        add("api", "org.springframework.boot:spring-boot-starter")
        add("api", "org.springframework.boot:spring-boot-starter-security")
        add("api", "org.springframework.boot:spring-boot-starter-logging")
        add("api", "jakarta.validation:jakarta.validation-api")
        add("api", "org.springdoc:springdoc-openapi-starter-common:${property("springdocVersion")}")
        compileOnly("org.springframework.boot:spring-boot-starter-web")
        compileOnly("org.springframework.boot:spring-boot-starter-data-jpa")
        compileOnly("jakarta.servlet:jakarta.servlet-api")
        testImplementation("org.springframework.boot:spring-boot-starter-web")
    }

    tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") { enabled = false }
    tasks.named<Jar>("jar") { enabled = true }
}

configure(listOf(project(":lorne-modulith"))) {
    configurations.all {
        resolutionStrategy.force(
            "org.springdoc:springdoc-openapi-starter-common:${property("springdocVersion")}",
            "org.springdoc:springdoc-openapi-starter-webmvc-ui:${property("springdocVersion")}",
            "org.springdoc:springdoc-openapi-starter-webmvc-api:${property("springdocVersion")}"
        )
    }

    the<io.spring.gradle.dependencymanagement.dsl.DependencyManagementExtension>().apply {
        imports {
            mavenBom("org.springframework.modulith:spring-modulith-bom:2.1.0")
        }
    }

    dependencies {
        implementation(project(":lorne-common"))

        implementation("org.springframework.boot:spring-boot-starter-web")
        implementation("org.springframework.boot:spring-boot-starter-security")
        implementation("org.springframework.boot:spring-boot-starter-data-jpa")
        implementation("org.springframework.boot:spring-boot-starter-validation")
        implementation("org.springframework.boot:spring-boot-starter-mail")
        implementation("org.springframework.boot:spring-boot-starter-actuator")
        implementation("org.aspectj:aspectjweaver")

        runtimeOnly("org.postgresql:postgresql")
        implementation("org.flywaydb:flyway-core")
        implementation("org.flywaydb:flyway-database-postgresql")
        implementation("org.springframework.boot:spring-boot-flyway")

        implementation("org.springframework.boot:spring-boot-starter-data-redis")
        implementation("org.springframework.boot:spring-boot-starter-cache")

        implementation("org.springframework.modulith:spring-modulith-starter-core")
        implementation("org.springframework.modulith:spring-modulith-starter-jpa")
        testImplementation("org.springframework.modulith:spring-modulith-starter-test")

        implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:${property("springdocVersion")}")

        implementation("io.jsonwebtoken:jjwt-api:0.13.0")
        runtimeOnly("io.jsonwebtoken:jjwt-impl:0.13.0")
        runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.13.0")
        implementation("org.springframework.security:spring-security-oauth2-resource-server")
        implementation("org.springframework.security:spring-security-oauth2-jose")

        implementation("software.amazon.awssdk:s3:2.26.7")
        implementation("org.apache.commons:commons-lang3:3.14.0")
        implementation("commons-io:commons-io:2.16.1")
        implementation("org.apache.pdfbox:pdfbox:3.0.3")

        testImplementation("org.springframework.security:spring-security-test")
        testImplementation("org.testcontainers:postgresql:${property("testcontainersVersion")}")
        testImplementation("org.testcontainers:junit-jupiter:${property("testcontainersVersion")}")
    }

    tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar") {
        archiveFileName.set("lorne-modulith.jar")
    }
    tasks.named<Jar>("jar") { enabled = false }
    tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
        val env = loadEnvFile()
        args = listOf("--server.port=8091")
        systemProperty("spring.profiles.active", System.getProperty("spring.profiles.active", env["SPRING_PROFILES_ACTIVE"] ?: "local"))
        environment(env)
    }
}
