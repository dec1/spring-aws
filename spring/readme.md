#  Spring Boot Web Application

### Setup 
- specify which JDK to use  via `JAVA_HOME` 
    - Windows 
        - Powershell: 
            - `$env:JAVA_HOME="C:\Users\<User-Name>\.jdks\corretto-21.0.8"`
        - Command Prompt: 
            - `set JAVA_HOME=C:\Users\<User-Name>\.jdks\corretto-21.0.8`
    - Linux
        -  typical for apt-based systems
            - `export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`

    - MacOS:
        - specifying version via e.g. `-v` is recommended if you have multiple versions installed 
            - `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`

###
- _Proxy (e.g. Zscaler)_
    If using a proxy like zscaler -- make sure to [import](local/proxy/readme.md) cert into jdk if you want to run app locally. App needs to download dependencies at build time, and to access the internet at runtime.

###
- **_AWS_ runtime access and credentials**  
    The app contains functionality that allows it to interact with resources like S3 buckets in AWS at runtime (independently of whether it's deployed in AWS or running locally). For this it needs access to the required AWS credentials when running:

    ####
    - _1) **Locally** (app is running on local machine)_  
        You can use either SSO or IAM user credentials:
        
        - **SSO** (recommended for organizations):
            - Configure SSO profile:
                - `aws configure sso --profile mpb`
            - Login when needed (tokens expire):
                - `aws sso login --profile mpb`
            - Set the profile for the app:
                - `export AWS_PROFILE=mpb`
        
        - **IAM User** (with access keys):
            - Configure credentials:
                - `aws configure --profile mpb`
                (Enter your access key ID, secret access key, region, and output format)
            - Set the profile for the app:
                - `export AWS_PROFILE=mpb`
            - Credentials are stored in `~/.aws/credentials`
        
        The app will access AWS resources using the permissions of your configured credentials.

    ####
    - _2) **Remotely** (app is deployed in AWS)_ 
        When the app runs in a container (for example, on ECS or EKS), it uses the IAM role defined in your infrastructure code (e.g. CDK or CloudFormation).  
        That role determines what AWS resources the app can access at runtime.  
        Both sets of credentials interact in this case:
        - Your local credentials (used to deploy the infrastructure) act as an **upper boundary** — they control what permissions can be assigned to the IAM role.  
        - The IAM role itself acts as a **runtime boundary**—it limits what the running container can actually do.

        In effect, the app's access to AWS resources is constrained by both your deployment credentials and the IAM role's defined permissions.

  
### Build
- `./gradlew [clean] build`


### Run
- from source  
    - `./gradlew bootRun [--args='--spring.profiles.active=dev']`  

        ####
        The optional command-line argument specifies a [Spring profile](#spring-profiles) to use,  and thus file (eg `src/main/resources/application-<name>.yaml` which can be used to set variables which can be used at runtime
        
        
        Alternatively, the spring profile can also be set via:
    
        ######
        -  an environment variable 
            `export SPRING_PROFILES_ACTIVE=dev`  
            `./gradlew bootRun`  (no other args needed)

        ####
        - or a JAVA system property (`-D`)
            .`./gradlew bootRun -Dspring.profiles.active=dev`  

###
- from [container](#containers)  
        
      
###
- check dependencies for new available versions
  - `./gradlew dependencyUpdates`




---
Endpoints:

  - local
    - http://localhost:8080/api/hello
    - http://localhost:8080/swagger-ui/index.html
    - Actuator:
      - http://localhost:8080/actuator
        - http://localhost:8080/actuator/health
        - http://localhost:8080/actuator/info
        - http://localhost:8080/actuator/env
        - http://localhost:8080/actuator/metrics


  - aws
    - dev
        - [https://dev.api.`<domain-name>:<appPortNum>`/api/hello](https://dev.api.<domain-name>/api/hello)
        - [https://dev.api.`<domain-name>:<appPortNum>`/swagger-ui/index.html](https://dev.api.<domain-name>/swagger-ui/index.html)
      - ....
    - release
        - [https://api.`<domain-name>:<appPortNum>`/api/hello](https://api.<domain-name>/api/hello)
        - [https://api.`<domain-name>:<appPortNum>`/swagger-ui/index.html](https://api.<domain-name>/swagger-ui/index.html)
      - ....
    
    `domain-name` and `appPortNum` should match values configured (for aws) in cdk `app/config/app-config.json`

---
## Containers
You _can_ embed the Spring application in a container, and run this container (e.g with docker or podman) locally.
You _must_ embed the application in a container image, and push the image to a registry defined in `../cdk/app/config/app-config.ts` in order to deploy it to AWS. Remember to update the image tag in `app-config.ts` and re-run `cdk deploy ...` every time you push a new image (tag) to the registry. 

(_Note_: Even if you push new content to an existing tag without changing it, you still need to run `cdk deploy` to force ECS to pull the updated image - however, this is bad practice as it makes it hard to track what's actually deployed. Prefer using unique tags for each build.)

### Proxy (e.g Zscaler)
You may need to add the following to `gradle.properties` (or even better `~/.gradle/gradle.properties` since the settings are machine specific), as the proxy can increase the time required for Jib to push images enough to cause timeouts with default settings:
```properties
systemProp.jib.httpTimeout=300000
systemProp.jib.connectionTimeout=300000
```a

Also, `jibDockerBuild` can't be used to build local images (for local running/testing) if you're behind a proxy like [Zscaler](local/proxy/readme.md), since Jib can't configure containers with custom certificates needed to access the internet from behind the proxy.




### Jib

Jib builds container images without docker, which is ideal e.g.  for CI which, on success,  pushes a container with the app embedded to a registry (from which the app can in turn can be pulled from by remote deployments).
Choose Docker Hub or Amazon ECR by uncommenting the appropriate line in `build.gradle.kts`.

- Setup 
    - _JAVA_HOME_ - set (as documented above) to appropriate JDK (eg java 21 - kotlin is not yet compatible with java 24, which may be the default jdk globally)
    - _Proxy_ - if behind one like zscaler, that re-signs certs, make sure to [import](local/proxy/readme.md) any certs needed into the jdk being used. Jib needs to be able to push images.



#####
- **build** and **push** to **Docker Hub**
    - in `build.gradle.kts`, uncomment the Docker Hub image line:
        - `image = "dec1/spring-aws-app:$version"`

    - set credentials (Docker Hub uses credentials directly, no separate auth step needed):

        - Linux/MacOS:
            * `export JIB_USERNAME=<your-dockerhub-username>`
            * `export JIB_PASSWORD=<your-dockerhub-password>`
        - Windows PowerShell:
            * `$env:JIB_USERNAME="<your-dockerhub-username>"`
            * `$env:JIB_PASSWORD="<your-dockerhub-password>"`
        - Windows Command Prompt:
            * `set JIB_USERNAME=<your-dockerhub-username>`
            * `set JIB_PASSWORD=<your-dockerhub-password>`

    - build and push:
        - `./gradlew clean jib`

#####
- **build** and **push** to **ECR**
    - in `build.gradle.kts`, uncomment the ECR image line (update account-id and region):
        - `image = "111122223333.dkr.ecr.us-east-1.amazonaws.com/spring-aws-app:$version"`

    - ensure AWS credentials are valid:
        - **if using SSO**: `aws sso login --profile mpb` (required if your session expired)
        - **if using IAM user**: credentials in `~/.aws/credentials` must be valid

    - authenticate to ECR (gets temporary token from AWS and stores credentials for jib):
        - `aws ecr get-login-password --region us-east-1 --profile mpb | docker login --username AWS --password-stdin 111122223333.dkr.ecr.us-east-1.amazonaws.com`

    - create repository (if needed):
        - `aws ecr create-repository --repository-name spring-aws-app --region us-east-1 --profile mpb`

    - build and push:
        - `./gradlew clean jib`

    - **required IAM permissions:**
        - `ecr:GetAuthorizationToken` (for login)
        - `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage` (for push)
        - attach `AmazonEC2ContainerRegistryPowerUser` policy, or create custom policy with these permissions



### Docker (alternative to Jib)

Use [Docker](local/docker/readme.md) instead of Jib if you're behind a proxy like [Zscaler](local/proxy/readme.md) and want to run containers locally. Jib can't configure containers with custom certificates needed for proxies.
   
See the detailed [Docker readme](local/docker/readme.md) for building images with custom certificates.

**Quick reference - running pre-built images:**
- Basic run:
    - `docker run -p 8080:8080 dec1/spring-aws-app:1.13.0`

- With AWS credentials:
    - Linux/MacOS:
        - `docker run --rm -p 8080:8080 --name spring-aws-app -v ${HOME}/.aws:/root/.aws -e AWS_PROFILE=mpb dec1/spring-aws-app:1.13.0`
    - WSL:
        - `docker run --rm -p 8080:8080 --name spring-aws-app -v /mnt/c/Users/<user-name>/.aws:/root/.aws -e AWS_PROFILE=mpb dec1/spring-aws-app:1.13.0`


---

## Spring Profiles
Spring concept used for environment-specific configuration
Key-value (hierarchical) properties  stored in `src/main/resources/`
Spring always (implicitly) loads `application.yaml` (or application.properties), if present. If you _activate_ another profile, it effectively tells Spring to also load the other file (from `application-<other>.yaml` or .properties), and overrides any clashing values from the base profile.

You can read these variables at runtime in code e.g. via `@Value("\${<key_name>}")`
Some dependencies (e.g. logging and Spring Actuator) such variables as configuration

```kotlin
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class MyService(
@Value("\${app.greeting}") private val greeting: String
) {
fun greet() = greeting   // app.greeting is defined in application.properties
}
```

