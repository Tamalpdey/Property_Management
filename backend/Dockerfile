FROM eclipse-temurin:25-jdk AS builder

WORKDIR /workspace/backend
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties lombok.config ./
COPY gradle ./gradle
COPY modules ./modules
RUN ./gradlew :lorne-modulith:bootJar --no-daemon

FROM eclipse-temurin:25-jre

WORKDIR /app
COPY --from=builder /workspace/backend/modules/lorne-modulith/build/libs/lorne-modulith.jar /app/lorne-modulith.jar

EXPOSE 8091
ENTRYPOINT ["java", "-jar", "/app/lorne-modulith.jar"]
