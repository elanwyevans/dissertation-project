#!/bin/bash

directory="./imagesToAnalyse"
imageUploadEndpoint="https://10jx25o96e.execute-api.us-east-1.amazonaws.com/dev/upload"

#check if target is not a directory
if [ ! -d "$directory" ]; then
  exit 1
fi

#loop through files in target directory
for file in "$directory"/*; do
  if [ -f "$file" ]; then
    imageName="$(basename "$file")"
    echo "uploading file $imageName"

#    curl command to upload image to S3 bucket
    curl --progress-bar -X POST \
    -H "Content-Type: multipart/form-data" \
    -F 'file=@"'$file'"' \
    -F 'filename="'$imageName'"' \
    --url $imageUploadEndpoint

    echo "finishing upload of file $imageName"

    sleep 1
  fi
done