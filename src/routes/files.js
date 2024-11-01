const crypto = require('crypto');
const path = require("path")
const fsp = require("fs").promises
const s3bucket = require("../utils/s3-bucket")
const { keys, sortBy } = require("lodash")
const uuid = require("uuid").v4

const TARGET_DIR = path.resolve(require("../../.config/ade-clinic").UPLOAD_DIR)

const Resumable = require('../utils/resumable-node.js')
const resumable = new Resumable(TARGET_DIR)


let UPLOADS = {}
let RECORDINGS = {}
let CHUNKED = {}

const updateChunked = data => {
    CHUNKED[data.id] = JSON.parse(JSON.stringify(data))
}

const getFileId = (req, res) => {
    if (!req.query.filename) {
        return res.status(500).end('query parameter missing');
    }
    res.end(
        crypto.createHash('md5')
        .update(req.query.filename)
        .digest('hex')
    );
}

const postUpload = async (req, res, next) => {
    if (req.eventHub.listenerCount("resumable-done") == 0) {
        req.eventHub.on("resumable-done", updateChunked)
    }
    resumable.post(req, res, next)
}

const getUpload = async (req, res) => {
    res.status(404).send("not found")
    return
}

////////////////////////////////////////////////////////////////////////////////////////////////////

const s3UploadStatus = async (req, res) => {
    let { uploadId } = req.body || req.query || req.params
    if (!UPLOADS[uploadId]) {
        res.status(200).send({})
    }
    let result = JSON.parse(JSON.stringify(UPLOADS[uploadId]))
    if (result.status == "done") {
        delete UPLOADS[uploadId]
    }
    res.status(200).send(result)
}

const readyForUpload = async uploadId => new Promise( (resolve, reject) => {
    let i = 0
    let interval = setInterval(()=> {
        i++
        console.log(`CHECK ready for upload ${uploadId}: ${i}`)
        console.log(CHUNKED[uploadId])
        if(CHUNKED[uploadId]) {
            clearInterval(interval)
            resolve()
        }
        if(i > 10) {
            clearInterval(interval)
            reject(new Error(`Upload ${uploadId} not ready after 10 retries.`))   
        }
    }, 250)
})

const s3Upload = async (req, res) => {
    try {
        let { uploadId, target } = req.body
        await readyForUpload(uploadId)

        console.log("Start Upload: ", uploadId)
        
        UPLOADS[uploadId] = { 
            target, 
            uploadedBytes: 0, 
            percents: 0, 
            status: "processed"
        }

        try {
            s3bucket.uploadChunks({
                chunks: sortBy(keys(CHUNKED[uploadId].chunk)),
                simultaneousUploads: 3,
                deleteUploadedChunks: true,
                target,
                size: CHUNKED[uploadId].size,
                callback: status => {
                    UPLOADS[uploadId] = status
                }
            })
         } catch (e) {
            console.log("s3bucket.uploadChunks", e.toString(), e.stack)
         }   

        res.status(200).send({ uploadId })
    
    } catch (e) {
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    }

}


const s3Metadata = async (req, res) => {
    
    try {
    
        let { source } = req.body
        let metadata = await s3bucket.metadata(source)
        res.status(200).send(metadata)
    
    } catch (e) {
    
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    
    }

}


const s3PresignedUrl = async (req, res) => {
    
    try {
    
        let { source } = req.body
        let url = await s3bucket.getPresignedUrl(source)
        res.status(200).send({ source, url })
    
    } catch (e) {
    
        console.error("s3Upload", e.toString(), e.stack)
        res.status(503).send(`s3Upload: ${e.toString()} ${e.stack}`)
    
    }

}

////////////////////////////////////////////////////////////////////////////////////////////////////




module.exports = {
    getFileId,
    getUpload,
    postUpload,
    s3Metadata,
    s3Upload,
    s3UploadStatus,
    s3PresignedUrl
}