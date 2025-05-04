# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Copy pom.xml for dependency resolution
COPY pom.xml .
# This layer caching technique speeds up builds
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src/ src/
RUN mvn package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app

# Copy the built jar from the build stage
COPY --from=build /app/target/backend-0.0.1-SNAPSHOT.jar app.jar

# Add environment variables for database connection
ENV SPRING_DATASOURCE_URL=jdbc:mysql://sql12.freesqldatabase.com:3306/sql12776886
ENV SPRING_DATASOURCE_USERNAME=sql12776886
ENV SPRING_DATASOURCE_PASSWORD=q8ZD5ylCuZ
# Fix MySQL dialect warning from your logs
ENV SPRING_JPA_DATABASE_PLATFORM=org.hibernate.dialect.MySQLDialect

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]