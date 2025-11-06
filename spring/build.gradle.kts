
plugins {
    val ver_kotlin = "2.1.0"

    kotlin("jvm") version "$ver_kotlin"
    kotlin("plugin.spring") version "$ver_kotlin"
    id("org.springframework.boot") version "3.4.0"
    id("io.spring.dependency-management") version "1.1.6"

    id("com.github.ben-manes.versions") version "0.51.0"
    //adds gradle task: "dependencyUpdates" (in "Tasks" -> "help" in Gradle tool window)
    //  - checks which dependencies are outdated
    // only show available stable (ie release)  updates:
    // ./gradlew dependencyUpdates [-Drevision=release]

    // build container images
    // https://github.com/peter-evans/kotlin-jib
    // https://github.com/GoogleContainerTools/jib/tree/master/jib-gradle-plugin#quickstart
    id("com.google.cloud.tools.jib") version "3.4.4"

}

group = "dec"
version = "1.66.0"
val ver_jdk = 21

kotlin {
    jvmToolchain(ver_jdk)
}
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(ver_jdk))
    }
}


repositories {
    mavenCentral()
}

val ver_openapi = "2.8.0"
val ver_aws = "2.29.34"

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    // aws
    implementation("software.amazon.awssdk:sts:$ver_aws")        // sts
    implementation("software.amazon.awssdk:s3:$ver_aws")         // s3
    implementation("software.amazon.awssdk:sso:$ver_aws")        // SSO
    implementation("software.amazon.awssdk:ssooidc:$ver_aws")    // SSO OIDC

    // Springdoc  (Swagger/OpenAPI UI)
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:$ver_openapi")  // http://localhost:8080/swagger-ui/index.html
    // implementation("org.springdoc:springdoc-openapi-security:2.1.0") // if endpoints are protected
    // implementation("org.springdoc:springdoc-openapi-kotlin:          // if you want to customize doc via customOpenAPI(),  publicApi()

    // --------------------------------------------------------------------
    // Instrumantation
    // ---------------

    // Spring Actuator
    implementation("org.springframework.boot:spring-boot-starter-actuator")


    // Further configure Micrometer, which actuator uses behind scenes

    // Micrometer Registry for Prometheus (ensures Prometheus format output)
    implementation("io.micrometer:micrometer-registry-prometheus")

    // Optional: For more richer metrics and tracing
    implementation("io.micrometer:micrometer-observation")

    implementation("io.prometheus:prometheus-metrics-exposition-formats:1.3.3")

    // The following are ONLY for Tracing.
    // implementation("io.micrometer:micrometer-tracing")
    // implementation("io.micrometer:micrometer-tracing-bridge-otel")
    // --------------------------------------------------------------------


    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    //automatic restarts and live reloads during development.
    developmentOnly("org.springframework.boot:spring-boot-devtools")



}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

// given jar a fixed predictable name - so can copy into docker image
tasks.bootJar {
    archiveFileName.set("my-app.jar")
    archiveFileName.set("my-app.jar")
}

//---------------------------------------------------------------------------------
// Ensure `resources/application.yaml` gets the  version (defined above)  injected
// Note: This requires using gradle to build (so intellij internal build wont work)
// There seems to be no way to have single source of truth for variables in build.gradle.kt and application*yaml
// without "manual" copying like this
tasks.processResources {
    filteringCharset = "UTF-8"
    filesMatching("**/application.yaml") {
        // val test = project.version.toString()
        println("tasks.processResources says project.version = ${project.version.toString()}")
        // Inject the project version into the 'app.version' property
        expand(mapOf("projectVersion" to project.version.toString()))

    }
}


//---------------------------------------------------------------------------------
// Jib - Container Images with application

// can be used to create local docker image
tasks.named("jibDockerBuild") {
    // Ensure gradle daemon can find docker executable
    doFirst {
        val currentPath = System.getenv("PATH") ?: ""
        println("Updated PATH for jibDockerBuild: $currentPath")
    }
}


// "jib" can be used to create and push  image to registry (without local docker)
jib {
    from {
        image = "amazoncorretto:21-alpine"
    }
    to {
        // REGISTRY SELECTION:
        // The image path format determines which registry is used:
        //   - "username/repo:tag"                                    → Docker Hub
        //   - "<account-id>.dkr.ecr.<region>.amazonaws.com/repo:tag" → Amazon ECR
        //
        // Uncomment the one you want to use:

        image = "dec1/spring-aws-app:$version"  // Docker Hub
        // image = "111122223333.dkr.ecr.us-east-1.amazonaws.com/spring-aws-app:$version"  // Amazon ECR

        auth {
            username = System.getenv("JIB_USERNAME") ?: ""
            password = System.getenv("JIB_PASSWORD") ?: ""
        }
    }
    container {
        environment = mapOf("APP_VERSION_FROM_ENV" to version.toString())
        ports = listOf("8080")
    }
}

