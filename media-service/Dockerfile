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

RUN groupadd -g 1001 media && \
    useradd -u 1001 -g media -s /bin/false media && \
    mkdir -p /var/media/uploads && \
    chown -R media:media /var/media/uploads

COPY --from=builder /build/target/*.jar app.jar
RUN chown media:media app.jar

USER media

EXPOSE 8081

VOLUME /var/media/uploads

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8081/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
