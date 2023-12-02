'use strict';

const ImageAnalyser = require('./lib/imageAnalyser');
const AWS = require("aws-sdk");
const BUCKET_NAME = "serverlessexampledewi"

/**
 Analyse an image on S3 using bucket and image name
 */
module.exports.imageAnalysis = (event) => {
    const data = JSON.parse(event.body);

    const s3Config = {
        bucket: BUCKET_NAME,
        imageName: data.imageName,
    };

    return ImageAnalyser
        .getImageLabels(s3Config)
        // if labels are returned from getImageLabels method (via resolve object), will execute this block
        .then(async (labels) => {
            //write to dynamo results of Rekognition for image
            const dynamoDb = new AWS.DynamoDB.DocumentClient();
            const putParams = {
                TableName: process.env.DYNAMODB_PROCESSED_IMAGE_LABEL_TABLE,
                Item: {
                    primary_key: data.imageName,
                    labels: JSON.stringify(labels),
                },
            };
            await dynamoDb.put(putParams).promise();


            return {
                statusCode: 200,
                body: JSON.stringify({Labels: labels}),
            };
        })
        // if no labels are returned from getImageLabels method (via reject object), will execute this block
        .catch((error) => {
            return {
                statusCode: error.statusCode || 501,
                headers: { 'Content-Type': 'text/plain' },
                body: error.message || 'Internal server error',
            }
        });
};