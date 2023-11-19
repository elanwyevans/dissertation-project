//import * as Busboy from "busboy"
const Busboy = require("busboy");

/**
 * Parses the multipart form data and returns the uploaded files and fields
 */
module.exports.parseFormData = async (event) =>
    new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: { "content-type": event.headers["content-type"] }
        })
        const fields = {}
        let uploadedFile

        // event listener for the form data
        busboy.on("file", (field, file, filename, encoding, contentType) => {
            let content = ""

            file.on("data", data => {
                // reads the file content in one chunk
                content = data
            })

            file.on("error", reject)

            file.on("end", () => {
                uploadedFile = {
                    filename,
                    encoding,
                    contentType,
                    content
                }
            })
        })

        busboy.on("field", (fieldName, value) => {
            fields[fieldName] = value
        })

        busboy.on("error", reject)

        busboy.on("finish", () => {
            resolve({ file: uploadedFile, fields })
        })

        busboy.write(event.body || "", event.isBase64Encoded ? "base64" : "binary")
        busboy.end()
    })