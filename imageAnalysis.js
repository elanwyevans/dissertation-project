'use strict';

const ImageAnalyser = require('./lib/imageAnalyser');
const AWS = require("aws-sdk");
const BUCKET_NAME = "drivinglicencephotostoanalyse"
const UNDETERMINED = "undetermined"
const REJECTED = "rejected"
const ACCEPTED = "accepted"

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
        let classification = UNDETERMINED;
        let reasons = [];

        //Confidence and Value properties
        //[FaceOccluded, EyesOpen, Sunglasses, Eyeglasses, MouthOpen]

        const rejectProperty = (property) => () => {
            classification = REJECTED;
            reasons.push(property)
        }

        const undeterminedProperty = (property) => () => {
            reasons.push(property)
            if (classification !== REJECTED) {
                classification = UNDETERMINED;
            }
        }

        const lackOfConfidenceOnProperty = (property) => () => {
            reasons.push(`${property} confidence too low.`)
            if (classification !== REJECTED) {
                classification = UNDETERMINED;
            }
        }

        const checkFaceDetailsConfidenceByProperty = (property, functionToCallWhenTrue, functionToCallWhenFalse, functionToCallWhenLackOfConfidence) => {
            if (labels.FaceDetails[0][property]) {

                if (labels.FaceDetails[0][property].Confidence >= 93) {


                    if (labels.FaceDetails[0][property].Value === false) {
                        functionToCallWhenFalse()

                    } else if (labels.FaceDetails[0][property].Value === true) {
                        functionToCallWhenTrue()
                    }

                } else if (labels.FaceDetails[0][property].Confidence < 93) {
                    functionToCallWhenLackOfConfidence()
                }

            }

        }

        if (Object.keys(labels).length === 0) {
            classification = REJECTED;
            reasons.push("Technical error. Labels cannot be processed.")
        }

        if (labels.FaceDetails.length === 0) {
            classification = REJECTED
            reasons.push("No face detected.")

        } else if (labels.FaceDetails.length > 1) {
            classification = REJECTED
            reasons.push("More than 1 face detected.")
        } else if (labels.FaceDetails.length === 1) {
            checkFaceDetailsConfidenceByProperty("FaceOccluded", rejectProperty("Face occluded."), () => {
            }, lackOfConfidenceOnProperty("FaceOccluded"))
            checkFaceDetailsConfidenceByProperty("Eyeglasses", undeterminedProperty("Wearing Eyeglasses."), () => {
            }, lackOfConfidenceOnProperty("Eyeglasses"))
            checkFaceDetailsConfidenceByProperty("Sunglasses", rejectProperty("Wearing Sunglasses."), () => {
            }, lackOfConfidenceOnProperty("Sunglasses"))
            checkFaceDetailsConfidenceByProperty("MouthOpen", rejectProperty("Mouth is open."), () => {
            }, lackOfConfidenceOnProperty("MouthOpen")) //weaker at detecting this with high confidence
            checkFaceDetailsConfidenceByProperty("EyesOpen", () => {
            }, rejectProperty("Eyes are closed"), lackOfConfidenceOnProperty("EyesOpen")) //weaker at detecting this with high confidence

            //Emotions
            // ".some" returns true if condition is met or false if it's not
            if (!labels.FaceDetails[0].Emotions.some(emotion => emotion.Type === "CALM")) {
                classification = REJECTED;
                reasons.push("Calm emotion not detected.")
            } else if (labels.FaceDetails[0].Emotions.some(emotion => emotion.Type === "CALM" && emotion.Confidence < 88)) {
                reasons.push("Calm emotion confidence too low.")
                if (classification !== REJECTED) {
                    classification = UNDETERMINED;
                }
            }

            //EyeDirection
            if (labels.FaceDetails[0].EyeDirection.Confidence < 98) {
                reasons.push("EyeDirection confidence too low.")
                if (classification !== REJECTED) {
                    classification = UNDETERMINED;
                }
            } else if (labels.FaceDetails[0].EyeDirection.Confidence >= 98) {

                if (labels.FaceDetails[0].EyeDirection.Pitch < -10 || labels.FaceDetails[0].EyeDirection.Pitch > 10) {

                    classification = REJECTED;
                    reasons.push("EyeDirection: Eye pitch (vertical axis) outside of range.")
                }
                if (labels.FaceDetails[0].EyeDirection.Yaw < -5 || labels.FaceDetails[0].EyeDirection.Yaw > 5) {
                    classification = REJECTED;
                    reasons.push("EyeDirection: Eye yaw (horizontal axis) outside of range.")
                }
            }

            //Pose
            if (labels.FaceDetails[0].Pose.Pitch < -15 || labels.FaceDetails[0].Pose.Pitch > 15) {
                classification = REJECTED;
                reasons.push("Pose: Face pitch (vertical axis) outside of range.")
            }
            if (labels.FaceDetails[0].Pose.Yaw < -6.5 || labels.FaceDetails[0].Pose.Yaw > 6.5) {
                classification = REJECTED;
                reasons.push("Pose: Face yaw (horizontal axis) outside of range.")
            }
            if (labels.FaceDetails[0].Pose.Roll < -10 || labels.FaceDetails[0].Pose.Roll > 10) {
                classification = REJECTED;
                reasons.push("Pose: Face roll (tilt) outside of range.")
            }

            //Image quality
            //note: rekognition doesnt have a confidence for image quality
            if (labels.FaceDetails[0].Quality.Brightness < 60 || labels.FaceDetails[0].Quality.Brightness > 100) {
                reasons.push("Image brightness outside of range.")
                if (classification !== REJECTED) {
                    classification = UNDETERMINED; //not reliable, varies with skin colour,
                    // 'undetermined' rather than 'reject' as no confidence stat provided
                    // so should be analysed by a clerk
                }
            }
            if (labels.FaceDetails[0].Quality.Sharpness < 65 || labels.FaceDetails[0].Quality.Sharpness > 100) {
                reasons.push("Image sharpness outside of range.")
                if (classification !== REJECTED) {
                    classification = UNDETERMINED; //not reliable, varies with skin colour,
                    // 'undetermined' rather than 'reject' as no confidence stat provided
                    // so should be analysed by a clerk
                }
            }

        }

        if (reasons.length === 0) {
            classification = ACCEPTED;
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