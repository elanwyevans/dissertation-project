#!/bin/bash

directory="./imagesToAnalyse"
imageUploadEndpoint="https://10jx25o96e.execute-api.us-east-1.amazonaws.com/dev/upload"
imageAnalysisEndpoint="https://10jx25o96e.execute-api.us-east-1.amazonaws.com/dev/analysis"

#check if target is not a directory
if [ ! -d "$directory" ]; then
  exit 1
fi

#loop through files in target directory
for file in "$directory"/*; do
  if [ -f "$file" ]; then
    imageName="$(basename "$file")"
    echo "uploading file $imageName"

#    curl command to trigger uploadFile lambda which uploads image to S3 bucket
    curl --progress-bar -X POST \
    -H "Content-Type: multipart/form-data" \
    -F 'file=@"'$file'"' \
    -F 'filename="'$imageName'"' \
    --url $imageUploadEndpoint

#    curl command to trigger imageAnalysis lambda which analyses the uploaded image
    curl -X POST -d '{"imageName":"'$imageName'"}' \
    --url $imageAnalysisEndpoint
  fi
done