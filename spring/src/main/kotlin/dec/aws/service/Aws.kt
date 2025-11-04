package dec.aws.service

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.model.GetCallerIdentityRequest

// Data class to hold the caller identity information
data class CallerIdentity(
    val userId: String?,
    val account: String?,
    val arn: String?
) {
    override fun toString(): String {
        return "CallerIdentity:\n" +
                "  User ID: $userId\n" +
                "  Account: $account\n" +
                "  ARN: $arn"
    }
}

class Aws {

    private val stsClient: StsClient = StsClient.builder()
       // .credentialsProvider(DefaultCredentialsProvider.create()) // Uses default chain
       // .credentialsProvider(ProfileCredentialsProvider.create("kk"))
        //.region(Region.AWS_GLOBAL) // STS is a global service
        .build()

    private val s3Client: S3Client = S3Client.builder()
        //.credentialsProvider(DefaultCredentialsProvider.create()) // Uses default chain
        //.credentialsProvider(ProfileCredentialsProvider.create("rio"))
        //.region(Region.US_WEST_1) // Replace with your desired region
        .build()


    fun test():  String  {
        return query_caller_id()
    }

    fun s3_insert(bucketName: String, objectKey: String, content: String) : String{

        var ret = "s3_insert Failed"
        val awsProfile = System.getenv("AWS_PROFILE")
        println("awsProfile = $awsProfile")
        print("trying to insert object '$objectKey' to bucket '$bucketName'...")

        try {
            val putObjectRequest = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(objectKey)
                .build()

            s3Client.putObject(putObjectRequest, software.amazon.awssdk.core.sync.RequestBody.fromString(content))
            ret = "Successfully added object '$objectKey' to bucket '$bucketName'."

        } catch (e: software.amazon.awssdk.services.s3.model.S3Exception) {
            ret = "S3 error occurred: ${e.awsErrorDetails().errorMessage()}"
        } catch (e: Exception) {
            ret = "An unexpected error occurred: ${e.message}"
        }

        println(ret)
        return ret
    }

    fun s3_query(bucketName: String) :  String {

        var ret = "s3_query Failed"
        try {
            val listObjectsRequest = ListObjectsV2Request.builder()
                .bucket(bucketName)
                .build()

            val listObjectsResponse = s3Client.listObjectsV2(listObjectsRequest)

            ret = "Objects in bucket '$bucketName': <br>"
            for (s3Object in listObjectsResponse.contents()) {
                ret += "- ${s3Object.key()} (Size: ${s3Object.size()} bytes)  <br>"
            }

        } catch (e: software.amazon.awssdk.services.s3.model.S3Exception) {
            ret = "S3 error occurred: ${e.awsErrorDetails().errorMessage()}"
        } catch (e: Exception) {
            ret = "An unexpected error occurred: ${e.message}"
        }
        println(ret)
        return ret
    }

    fun s3_ls(): String {
        var ret = "s3_ls Failed"
        val awsProfile = System.getenv("AWS_PROFILE")
        println("awsProfile = $awsProfile")
        print("Trying to list S3 buckets... ")

        try {
            val listBucketsResponse = s3Client.listBuckets()
            val buckets = listBucketsResponse.buckets()

            if (buckets.isEmpty()) {
                ret = "No buckets found."
            } else {
                ret = "Buckets:\n"
                for (bucket in buckets) {
                    ret += "- ${bucket.name()} (Creation Date: ${bucket.creationDate()})\n"
                }
            }

        } catch (e: software.amazon.awssdk.services.s3.model.S3Exception) {
            ret = "S3 error occurred: ${e.awsErrorDetails().errorMessage()}"
        } catch (e: Exception) {
            ret = "An unexpected error occurred: ${e.message}"
        }

        println(ret)
        return ret
    }


    fun query_caller_id(): String {

        // Create the GetCallerIdentity request
        val request = GetCallerIdentityRequest.builder().build()

        // Call the STS service
        val response = stsClient.getCallerIdentity(request)

        // Extract information from the response
        val callerIdentity = CallerIdentity(
            userId = response.userId(),
            account = response.account(),
            arn = response.arn()
        )

        // Close the client to free resources
        //stsClient.close()

        return callerIdentity.toString()
    }
}
