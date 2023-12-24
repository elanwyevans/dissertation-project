'use strict';

const ImageAnalyser = require('./lib/imageAnalyser');
const AWS = require("aws-sdk");
const BUCKET_NAME = "drivinglicencephotostoanalyse"

/**
 Analyse an image on S3 using bucket and image name
 */
module.exports.imageAnalysis = (event) => {
    const data = JSON.parse(event.body);

    const s3Config = {
        bucket: BUCKET_NAME,
        imageName: data.imageName,
    };

    const classifyWithReasons = (labels) => {
        let classification = "undetermined";
        let reasons = [];

        //Confidence and Value properties
        //[FaceOccluded, EyesOpen, Sunglasses, Eyeglasses, MouthOpen]

        const rejectProperty = (property) => () => {
            classification = "rejected";
            reasons.push(property)
        }

        const underterminedProperty = (property) => () => {
            if (classification !== "rejected") {
                classification = "undertermined";
                reasons.push(property)
            }
        }

        const lackOfConfidenceOnProperty = (property) => () => {
            if (classification !== "rejected") {
                classification = "undetermined";
                reasons.push(`${property} confidence too low.`)
            }
        }

        const checkFaceDetailsConfidenceByProperty = (property, functionToCallWhenTrue, functionToCallWhenFalse, functionToCallWhenLackOfConfidence) => {
            if (labels.FaceDetails[0][property]) {

                if (labels.FaceDetails[0][property].Confidence >= 99) {


                    if (labels.FaceDetails[0][property].Value === false) {
                        functionToCallWhenFalse()

                    } else if (labels.FaceDetails[0][property].Value === true) {
                        functionToCallWhenTrue()
                    }

                } else if (labels.FaceDetails[0][property].Confidence < 99) {
                    functionToCallWhenLackOfConfidence()
                }

            }

        }

        if (Object.keys(labels).length === 0) {
            classification = "rejected";
            reasons.push("Technical error. Labels cannot be processed.")
        }

        if (labels.FaceDetails.length === 0) {
            classification = "rejected"
            reasons.push("No face detected.")

        } else if (labels.FaceDetails.length > 1) {
            classification = "rejected"
            reasons.push("More than 1 face detected.")
        } else if (labels.FaceDetails.length === 1) {
            checkFaceDetailsConfidenceByProperty("FaceOccluded", rejectProperty("Face occluded."), () => {
            }, lackOfConfidenceOnProperty("FaceOccluded"))
            checkFaceDetailsConfidenceByProperty("Eyeglasses", underterminedProperty("Wearing Eyeglasses."), () => {
            }, lackOfConfidenceOnProperty("Eyeglasses"))
            checkFaceDetailsConfidenceByProperty("Sunglasses", rejectProperty("Wearing Sunglasses."), () => {
            }, lackOfConfidenceOnProperty("Sunglasses"))
            checkFaceDetailsConfidenceByProperty("MouthOpen", rejectProperty("Mouth is open."), () => {
            }, lackOfConfidenceOnProperty("MouthOpen"))
            checkFaceDetailsConfidenceByProperty("EyesOpen", () => {
            }, rejectProperty("Eyes are closed"), lackOfConfidenceOnProperty("EyesOpen"))

            //Emotions
            // ".some" returns true if condition is met or false if it's not
            if (labels.FaceDetails[0].Emotions.some(emotion => emotion.Type !== "CALM")) {
                classification = "rejected";
                reasons.push("Calm emotion not detected.")
            } else if (labels.FaceDetails[0].Emotions.some(emotion => emotion.Type === "CALM" && emotion.Confidence < 99)) {
                classification = "undetermined";
                reasons.push("Calm emotion confidence too low.")
            }

            //EyeDirection
            if (labels.FaceDetails[0].EyeDirection.Confidence < 99) {
                classification = "undetermined";
                reasons.push("EyeDirection confidence too low.")
            } else if (labels.FaceDetails[0].EyeDirection.Confidence >= 99) {

                if (labels.FaceDetails[0].EyeDirection.Pitch < -3 || labels.FaceDetails[0].EyeDirection.Pitch > 3) {

                    classification = "rejected";
                    reasons.push("Eye pitch (vertical axis) outside of range.")
                } else if (labels.FaceDetails[0].EyeDirection.Yaw < -3 || labels.FaceDetails[0].EyeDirection.Yaw > 3) {
                    classification = "rejected";
                    reasons.push("Eye yaw (horizontal axis) outside of range.")
                }
            }

            //Pose
            if (labels.FaceDetails[0].Pose.Pitch < -3 || labels.FaceDetails[0].Pose.Pitch > 3) {

                classification = "rejected";
                reasons.push("Face pitch (vertical axis) outside of range.")
            } else if (labels.FaceDetails[0].Pose.Yaw < -3 || labels.FaceDetails[0].Pose.Yaw > 3) {
                classification = "rejected";
                reasons.push("Face yaw (horizontal axis) outside of range.")
            } else if (labels.FaceDetails[0].Pose.Roll < -3 || labels.FaceDetails[0].Pose.Roll > 3) {
                classification = "rejected";
                reasons.push("Face roll (tilt) outside of range.")
            }

            //Image quality
            if (labels.FaceDetails[0].Quality.Brightness < 60 || labels.FaceDetails[0].Quality.Brightness > 100) {

                classification = "rejected";
                reasons.push("Image brightness outside of range.")
            } else if (labels.FaceDetails[0].Quality.Sharpness < 60 || labels.FaceDetails[0].Quality.Sharpness > 100) {
                classification = "rejected";
                reasons.push("Image sharpness outside of range.")
            }

        }

        if (reasons.length === 0) {
            classification = "accepted";
        }

        return {classification: classification, reasons: reasons}

    }

    return ImageAnalyser
        .getImageLabels(s3Config)
        // if labels are returned from getImageLabels method (via resolve object), will execute this block
        .then(async (labels) => {

            //classifier that checks parameters returned within the labels and decides if an image
            //is accepted, rejected or undetermined

            let {classification, reasons} = classifyWithReasons(labels)


            //decision to accept/reject a photo is determined then saved in the dynamodb table
            //alongside the labels for that photo

            //write to dynamo results of Rekognition for image
            const dynamoDb = new AWS.DynamoDB.DocumentClient();
            const putParams = {
                TableName: process.env.DYNAMODB_PROCESSED_IMAGE_LABEL_TABLE,
                Item: {
                    primary_key: data.imageName,
                    labels: JSON.stringify(labels),
                    classification: classification,
                    reasons: reasons
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
                headers: {'Content-Type': 'text/plain'},
                body: error.message || 'Internal server error',
            }
        });
}
;