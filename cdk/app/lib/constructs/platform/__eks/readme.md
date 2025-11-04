### Setup Kubectl 

to work with with AWS Kubernetes Cluster 

- `aws eks update-kubeconfig` `--name <Eks_Cluster_Name>` `--profile mpb`
    - eg
    `aws eks update-kubeconfig --name K8sPlatformK8sCluster1B679CB5-ad60e730d1154074a2ce1fa836c15ee4 --profile mpb`


`set SSL_CERT_FILE=C:\Users\<User-name>\Documents\zone\mid\certs\zscaler.pem`