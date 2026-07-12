FROM eclipse-temurin:17-jdk AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*

COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

COPY src src
RUN ./mvnw package -DskipTests -B

FROM eclipse-temurin:17-jre

WORKDIR /app

RUN groupadd -g 1002 notif && \
    useradd -u 1002 -g notif -s /bin/false notif

COPY --from=builder /build/target/*.jar app.jar
RUN chown notif:notif app.jar

USER notif

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8082/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
