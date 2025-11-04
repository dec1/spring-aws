package dec.aws.controller

import dec.aws.service.Aws
import io.swagger.v3.oas.annotations.Operation
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class ApiController(private val env: Environment){
//    @Value("\${spring.application.name}") private val app_name: String,
//    @Value("\${app.version}") private val app_version: String,
    fun getAppVersion(): String = env.getProperty("app.version") ?: "unknown"

    fun getAppName(): String = env.getProperty("spring.application.name") ?: "unknown"

    // http://localhost:8080/api/hello
    @Operation(summary = "Brief Info", description = "Welcome confirmation message")
    @RequestMapping("/hello", method = [RequestMethod.GET])
    fun greet(): String {
        return "Welcome to ${getAppName()}, version ${getAppVersion()}"
    }


    // http://localhost:8080/api/aws_hello
    @Operation(summary = "Query Aws Access", description = "Query Aws for the id and account of the caller (getCallerIdentity)")
    @RequestMapping("/aws_caller_info", method = [RequestMethod.GET])
    fun greet_aws(): String {
        val asw_val = Aws().test()
        return greet() + ", aws says: $asw_val"
    }

    // http://localhost:8080/api/s3_insert?bucket_name=my-bucket-dec1b&object_name=obj34&object_value=57
    @Operation(summary = "Insert into an S3 bucket")
    @RequestMapping("/s3_bucket_insert", method = [RequestMethod.POST])
    fun s3_insert(
        @RequestParam(name = "bucket_name", required = false, defaultValue = "my-bucket") bucketName: String,
        @RequestParam(name = "object_name", required = false, defaultValue = "my-object") objectName: String,
        @RequestParam(name = "object_value", required = false, defaultValue = "Hello, AWS!") objectValue: String)
    : ResponseEntity<String>
    {

        val ret = Aws().s3_insert(bucketName, objectName, objectValue)
        return ResponseEntity.ok(ret)
    }

    //http://localhost:8080/api/s3_query?bucket_name=my-bucket-dec1b
    @Operation(summary = "Show contents of an S3 bucket")
    @RequestMapping("/s3_bucket_show", method = [RequestMethod.GET])
    fun s3_query(
        @RequestParam(name = "bucket_name", required = false, defaultValue = "my-bucket") bucketName: String)
    : ResponseEntity<String> {
        val ret = Aws().s3_query(bucketName)
        return ResponseEntity.ok(ret)
    }

    //http://localhost:8080/api/s3_list
    @Operation(summary = "List S3 buckets accessible to the caller")
    @RequestMapping("/s3_buckets_list", method = [RequestMethod.GET])
    fun s3_ls(): ResponseEntity<String> {
        val ret = Aws().s3_ls()
        return ResponseEntity.ok(ret)
    }
}
