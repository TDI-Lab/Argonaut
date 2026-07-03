# ── Stage 1: Build the EPOS fat JAR from the root project ──────────────────
FROM maven:3.9-eclipse-temurin-17 AS epos-build
WORKDIR /src/epos

# Copy the root EPOS project (everything needed for the mvn build)
COPY pom.xml .
COPY src ./src

# Bundle local libs (protopeer, etc.)
COPY src/main/resources/lib ./src/main/resources/lib

RUN mvn package -DskipTests -q
# Output: target/tutorial-0.0.1.jar  (shaded fat jar)

# ── Stage 2: Build the Spring Boot API JAR ──────────────────────────────────
FROM maven:3.9-eclipse-temurin-17 AS api-build
WORKDIR /src/api
COPY backend/pom.xml .
COPY backend/src ./src
RUN mvn package -DskipTests -q
# Output: target/epos-api-1.0.0.jar

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine
RUN apk add --no-cache python3 py3-numpy py3-pip freetype && \
    pip3 install --no-cache-dir --break-system-packages pandas matplotlib

WORKDIR /app

COPY --from=epos-build /src/epos/target/tutorial-0.0.1.jar  /app/epos.jar
COPY --from=api-build  /src/api/target/epos-api-1.0.0.jar   /app/api.jar

# Scripts required at runtime
COPY scripts/generate_viz_data.py                            /app/scripts/generate_viz_data.py
COPY mathematical_way/run_experiment.py                      /app/mathematical_way/run_experiment.py
COPY mathematical_way/code.py                                /app/mathematical_way/code.py
COPY mathematical_way/brute_force_visualizer.py              /app/mathematical_way/brute_force_visualizer.py
COPY mathematical_way/epos_utils.py                          /app/mathematical_way/epos_utils.py

# Built-in datasets available for selection in the UI
COPY datasets/                                               /app/datasets/
COPY scripts/preprocess_datasets.py                          /app/scripts/preprocess_datasets.py
RUN python3 /app/scripts/preprocess_datasets.py /app/datasets

ENV EPOS_JAR=/app/epos.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/api.jar"]
