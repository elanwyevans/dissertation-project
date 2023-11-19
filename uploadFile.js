
const { S3 } = require('aws-sdk');
const queryString = require("querystring");
const { parseFormData } = require("./lib/common");

const s3Client = new S3()
const BUCKET_NAME = "serverlessexampledewi"

module.exports.uploadFile = async (event) => {
    const { file, fields } = await parseFormData(event)

    if (!file) {
        return {
            statusCode: 401,
            body: JSON.stringify({ description: "missing file field" })
        }
    }

    const tags = file?.filename ? { filename: file?.filename } : undefined
    try {
        await s3Client
            .putObject({
                Bucket: BUCKET_NAME,
                Key: fields.filename || file?.filename,
                Body: file.content,
                Tagging: queryString.encode(tags)
            })
            .promise()

        return {
            statusCode: 200,
            body: JSON.stringify({ description: "file created", result: "ok", filename: (fields.filename || file?.filename) })
        }
    } catch (err) {
        return {
            statusCode: 409,
            body: JSON.stringify({ description: "something went wrong" })
        }
    }
}
