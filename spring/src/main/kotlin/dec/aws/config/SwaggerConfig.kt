package dec.aws.config

import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import org.springframework.beans.factory.annotation.Value
//import org.springdoc.core.GroupedOpenApi
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment

@Configuration
class SwaggerConfig(private val env: Environment) {

    //@Value("\${app.version}") // from resources/application.yaml
    //private lateinit var appVersion: String

    // http://localhost:8080/swagger-ui/index.html
    @Bean
    fun customOpenAPI(): OpenAPI {
        val appVersion = env.getProperty("app.version") ?: "unknown"
        return OpenAPI()
            .info(
                Info()
                    .title("My Spring-Aws API")
                    .version(appVersion)
                    .description("Description of my API")
            )
    }
    //



//    @Bean
//    fun publicApi(): GroupedOpenApi {
//        return GroupedOpenApi.builder()
//            .group("public")
//            .pathsToMatch("/**")
//            .build()
//    }
}
