# Setting Up Serverless Framework With AWS

## Installation

If you don’t already have Node.js on your machine, install it first.

Install project dependencies via NPM using following command:

```
npm install
```

## Setting up AWS credentials

1. Sign in to AWS console
2. Go to your AWS account overview 
3. Click on your account name in the upper-right hand corner & select 'Security Credentials'
4. Select 'create access key' which will create an access key and secret access key
4. Copy \<Access Key>
5. Copy \<Secret Access Key>
6. In terminal in project, execute following command: 

```serverless config credentials --provider aws --key <Access Key> --secret <Secret Access Key>```

As drivinglicencephotostoanalyse S3 bucket already exists globally, you need to change the name to a unique one.
Change the name to one of your choice in the following files: serverless.yml, imageAnalysis.js and uploadFile.js


### Deployment

Run the following command to deploy the service:

```
serverless deploy
```

After deploying, you should see output in the terminal similar to:

```bash
Deploying aws-node-http-api-project to stage dev (us-east-1, "default" provider)
✔ Your AWS account is now integrated into Serverless Framework Observability
✔ Serverless Framework Observability is enabled

✔ Service deployed to stack aws-node-http-api-project-dev (93s)

dashboard: https://app.serverless.com/elanwy/apps/aws-node-http-api-application/aws-node-http-api-project/dev/us-east-1
endpoints:
  POST - https://26qa4bf36e.execute-api.us-east-1.amazonaws.com/dev/analysis
  POST - https://26qa4bf36e.execute-api.us-east-1.amazonaws.com/dev/upload
functions:
  imageAnalysis: aws-node-http-api-project-dev-imageAnalysis (46 MB)
  uploadFile: aws-node-http-api-project-dev-uploadFile (46 MB)
```


### Invocation

Following deployment, edit the uploadImagesBash.sh file and change the
the HTTP endpoints that will trigger the Lambda functions e.g:

```
imageUploadEndpoint="https://26qa4bf36e.execute-api.us-east-1.amazonaws.com/dev/upload"
imageAnalysisEndpoint="https://26qa4bf36e.execute-api.us-east-1.amazonaws.com/dev/analysis" 
```

You can now call the created application 
via HTTP by running the bash script in the uploadImagesBash.sh file
using the following command:

```uploadImagesBash.sh file```
