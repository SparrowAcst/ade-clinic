const mongodb = require("../utils/mongodb")
const {
    extend,
    sortBy,
    uniq,
    flattenDeep,
    find,
    difference,
    isArray,
    maxBy,
    keys,
    first,
    last,
    isUndefined,
    groupBy,
    isString,
    unionBy
} = require("lodash")
const moment = require("moment")
const path = require("path")
const uuid = require("uuid").v4
const axios = require("axios")
const fs = require("fs")
const fsp = require("fs").promises
const filesize = require("file-size")

const s3Bucket = require("../utils/s3-bucket")
const fb = require("../utils/fb")

const { transferClinicData } = require("../long-term/transfer-clinic-data")

const config = require("../../.config/ade-clinic")

const TEMP_UPLOAD_DIR = path.resolve(config.UPLOAD_DIR)
const DB = config.mongodb

const getGrants = async (req, res) => {
    
    try {

        const { user, examinationID } = req.body.options 
        const { users } = req.body.cache
        
        let grants = find(users, u => u.email.includes(user.email))

        if (!grants) {
            res.send({
                error: `Access denied for user ${user.email}`
            })
            return
        }

        if (!isUndefined(examinationID)) {
            if (grants.patientPrefix.filter(d => examinationID.startsWith(d)).length == 0) {
                grants.role = "reader"
            } else {
                grants.role = "writer"
            }
        }

        res.send(grants)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


const getRules = async (req, res) => {
    try {

        let options = req.body.options

        const { user, examinationID } = req.body.options 
        const { rules } = req.body.cache
       

        let prefix = options.examinationID.substr(0, 3)
        let result = find(rules, r => r.patientPrefix.includes(prefix)) || {
            recordings: [],
            files: []
        }
       
        res.send(result)


    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


const getForms = async (req, res) => {
    try {

        const {user, examinationID} = req.body.options

        let data = await mongodb.aggregate({
            db: DB,
            collection: `${DB.name}.forms`,
            pipeline: [{
                    '$match': {
                        'examination.patientId': examinationID
                    }
                },
                {
                    '$project': {
                        '_id': 0
                    }
                }
            ]
        })

        data = data[0]
        if (data) {
            if (data.examination.state == "pending") {
                data.readonly = false
                res.send(data)
            } else {

                /////////////////////////////////////////////////
                data.readonly = true
                /////////////////////////////////////////////////

                res.send(data)
            }
        } else {
            res.send({
                error: `Examination ${examinationID} not available for user ${user.email}`
            })
        }


    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


const lockForms = async (req, res) => {
    try {

        const { grants, user, examinationID} = req.body.options


        let data = await mongodb.aggregate({
            db: DB,
            collection: `${DB.name}.forms`,
            pipeline: [{
                    '$match': {
                        'examination.patientId': examinationID
                    }
                },
                {
                    '$project': {
                        '_id': 0
                    }
                }
            ]
        })

        data = data[0]
        if (data) {

            data["locked by"] = grants.name
            data["locked at"] = new Date()

            const result = await mongodb.replaceOne({
                db: DB,
                collection: `${DB.name}.forms`,
                filter: {
                    'examination.patientId': data.examination.patientId
                },
                data
            })

            res.send(result)

        } else {
            res.send({
                error: `Examination ${examinationID} not available for user ${user.email}`
            })
        }


    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


const unlockForms = async (req, res) => {
    try {
        
        let options = (isString(req.body)) ? JSON.parse(req.body).options : req.body.options

        const { user, examinationID } = options


        let data = await mongodb.aggregate({
            db: DB,
            collection: `${DB.name}.forms`,
            pipeline: [{
                    '$match': {
                        'examination.patientId': examinationID
                    }
                },
                {
                    '$project': {
                        '_id': 0
                    }
                }
            ]
        })

        data = data[0]
      
        if (data) {

            delete data["locked by"]
            delete data["locked at"]
            const result = await mongodb.replaceOne({
                db: DB,
                collection: `${DB.name}.forms`,
                filter: {
                    'examination.patientId': data.examination.patientId
                },
                data
            })
            res.send(result)

        } else {
           
            res.send({
                error: `Examination ${examinationID} not available for user ${user.email}`
            })
        
        }


    } catch (e) {
        console.log("ERROR", e.toString())

        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const updateForms = async (req, res) => {
    try {

        let { form } = req.body.options
        
        delete form["locked by"]
        delete form["locked at"]


        const result = await mongodb.replaceOne({
            db: DB,
            collection: `${DB.name}.forms`,
            filter: {
                'examination.patientId': form.examination.patientId
            },
            data: form
        })


        res.send(result)

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


const getExaminationList = async (req, res) => {

    let availableForms = await mongodb.aggregate({
        db: DB,
        collection: `${DB.name}.forms`,
        pipeline: [{
                '$match': {
                    'examination.state': "pending"
                }
            },
            {
                $project: {
                    _id: 0,
                    "Patient ID": "$examination.patientId",
                    "Patient Form": "$completeness.Patient Form",
                    "EKG Form": "$completeness.EKG Form",
                    "Echo Form": "$completeness.Echo Form",
                    "Recordings": "$completeness.Recordings",
                    "Files": "$completeness.Files",

                    "updated at": "$updated at",
                    comment: "$comment",
                    status: "$status",
                    protocol: "$protocol",
                    "updated by": "$updated by",
                    "locked by": "$locked by",
                    "locked at": "$locked at",
                },
            },
            {
                $sort: {
                    "Patient ID": 1,
                },
            }
        ]
    })

    res.send(availableForms)
}


const downloadFromUrl = async ({ source, target }) => {

    // axios image download with response type "stream"
    const response = await axios({
        method: 'GET',
        url: source,
        responseType: 'stream'
    })

    // pipe the result stream into a file on disc
    response.data.pipe(fs.createWriteStream(target))

    // return a promise and resolve when download finishes
    return new Promise((resolve, reject) => {
        response.data.on('end', () => {
            resolve()
        })

        response.data.on('error', () => {
            reject()
        })
    })

}

const copyFromURLToS3 = async ({ source, target }) => {
    try {

        let tempFileName = `${TEMP_UPLOAD_DIR}/${uuid()}.temp`
        console.log(source)
        console.log(target)
        console.log(tempFileName)

        await downloadFromUrl({
            source,
            target: tempFileName
        })

        await s3Bucket.uploadLt20M({
            source: tempFileName,
            target
        })

        let res = await s3Bucket.metadata(target)
        console.log(res)


        await fsp.unlink(tempFileName)

        return {
            id: uuid(),
            name: last(res.Key.split("/")),
            publicName: last(res.Key.split("/")),
            path: res.Key,
            mimeType: res.ContentType,
            size: res.ContentLength,
            updatedAt: res.LastModified,
            source: "Stetophone Data",
            storage: "s3",
            url: res.url,
            valid: true
        }

    } catch (e) {
        console.log(`copyFromURLToS3`, e.toString(), e.stack)
    }

}




const syncAssets = async (req, res) => {

    try {
        
        let { examinationID, grants, eid } = req.body.options

        // let assets = await fb.getFbAssets(eid)
        let assets = await fb.getFbAssets1(examinationID)
        
        console.log(assets.files)


        assets.files = assets.files.map(a => {
            a.source = "Stethophone Data"
            if (a.mimeType == "application/octet-stream") {
                a.mimeType = "image/jpg"
                a.name = a.name.replace("octet-stream", "jpg")
            }
            if (!a.mimeType) {
                a.mimeType = "image/jpg"
                a.name = a.name.replace("undefined", "jpg")
            }
            return a
        })

        let upd = []
        
        for (let f of assets.files) {

            let target = `${grants.backup.home}/${examinationID}/FILES/${f.name}`
            let metadata = await s3Bucket.metadata(target)
            
            console.log(f.name, metadata)
            console.log("target", target)


            if (!metadata) {

                await s3Bucket.uploadFromURL({
                    source: f.url,
                    target,
                    callback: (progress) => {
                        console.log(`UPLOAD ${target}: ${filesize(progress.loaded).human("jedec")} from ${filesize(progress.total).human("jedec")} (${(100*progress.loaded/progress.total).toFixed(1)}%)`)
                    }

                })

                metadata = await s3Bucket.metadata(target)
            }

            upd.push({
                id: uuid(),
                name: last(metadata.Key.split("/")),
                publicName: last(metadata.Key.split("/")),
                path: metadata.Key,
                mimeType: metadata.ContentType,
                size: metadata.ContentLength,
                updatedAt: metadata.LastModified,
                source: "Stetophone Data",
                storage: "s3",
                url: metadata.url,
                valid: true
            })
        }

        assets.files = upd

        res.send(assets)
    } catch (e) {
        console.log("Sync Assets Error", e.toString(), e.stack, JSON.stringify(req.body))
        throw e
    }    

}


const syncExaminations = async (req, res) => {

    const prepareForms = async examination => {

        examination = await fb.expandExaminations(...[examination])

        examination = (isArray(examination)) ? examination[0] : examination

        // console.log("examination", examination.$extention.assets)


        let formRecords = examination.$extention.forms.map(f => {
            let res = extend({}, f)
            res.examinationId = examination.id
            let key = maxBy(keys(f.data))
            res.data = res.data[key]
            res.id = f.id
            return res
        })


        let form = {}
        let ftypes = ["patient", "ekg", "echo"]
        ftypes.forEach(type => {
            let f = find(formRecords, d => d.type == type)
            form[type] = (f && f.data) ? f.data.en : {}

        })

        form.examination = {
            "id": examination.id,
            "dateTime": examination.dateTime,
            "patientId": examination.patientId,
            "comment": examination.comment,
            "state": examination.state
        }

        return form

    }


    try {

        const { user } = req.body.options
        const { users } = req.body.cache

        let grants = find(users, u => u.email.includes(user.email))

        if (!grants) {
            res.send({
                error: `Access denied for user ${options.user.email}`
            })
            return
        }

        // console.log("--------------------------------< FB")

        let examinations_fb = await fb.getCollectionItems(
            "examinations",
            [
                ["state", "==", "pending"]
            ]
        )

        // console.log("--------------------------------> FB")

        
        examinations_fb = examinations_fb.filter(e => grants.patientPrefix.map(p => e.patientId.startsWith(p)).reduce((a, b) => a || b, false))

        // console.log("examinations_fb", examinations_fb)

        // console.log("--------------------------------< M1")

        let examinations_mg = await mongodb.aggregate({
            db: DB,
            collection: `${DB.name}.forms`,
            pipeline: [
                {
                    '$match': {
                        'examination.state': "pending"
                    }
                },
                {
                    '$project': {
                        '_id': 0
                    }
                }
            ]
        })

        // console.log("--------------------------------> M1")


        examinations_mg = examinations_mg.filter(e => grants.patientPrefix.map(p => e.examination.patientId.startsWith(p)).reduce((a, b) => a || b, false))

        // console.log("examinations_mg", examinations_mg)

        let toBeAdded = difference(examinations_fb.map(d => d.patientId), examinations_mg.map(d => d.examination.patientId))
        let toBeLocked = difference(examinations_mg.map(d => d.examination.patientId), examinations_fb.map(d => d.patientId))

        let availablePatents = unionBy(examinations_mg.map(d => d.examination.patientId), examinations_fb.map(d => d.patientId))

        toBeAdded = examinations_fb.filter(e => {
            return toBeAdded.includes(e.patientId)
        })

        
        let forms = []

        for (let i = 0; i < toBeAdded.length; i++) {
            let exam = toBeAdded[i]
            let form = await prepareForms(exam)
            forms.push(form)
        }

        if (forms.length > 0) {

            let replaceCommands = forms.map( form => ({
                replaceOne: {
                    "filter": { 'examination.patientId': form.examination.patientId },
                    "replacement": form,
                    "upsert": true
                }
            }))

            await mongodb.bulkWrite({
                db: DB,
                collection: `${DB.name}.forms`,
                commands: replaceCommands
            })

        }

        toBeLocked = examinations_mg.filter(e => toBeLocked.includes(e.patientId))

        if(toBeLocked.length > 0){
            let replaceCommands = forms.map( form => ({
                updateOne: {
                    "filter": { 'examination.patientId': form.examination.patientId },
                    "update": { 
                        $set: { 
                            "examination.state": "locked"
                        }
                    }
                }
            }))

            await mongodb.bulkWrite({
                db: DB,
                collection: `${DB.name}.forms`,
                commands: replaceCommands
            })
        }
        
        // let availablePatents = examinations_fb.map(f => f.patientId)

        console.log("Sync Examination: user:", user,  "availablePatents:", availablePatents)

        let availableForms = await mongodb.aggregate({
            db: DB,
            collection: `${DB.name}.forms`,
            pipeline: [{
                    '$match': {
                        'examination.state': "pending",
                        "examination.patientId": {
                            $in: availablePatents
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        "Patient ID": "$examination.patientId",
                        "Patient Form": "$completeness.Patient Form",
                        "EKG Form": "$completeness.EKG Form",
                        "Echo Form": "$completeness.Echo Form",
                        "Recordings": "$completeness.Recordings",
                        "Files": "$completeness.Files",
                        "Protocol": "$protocol",

                        "updated at": "$updated at",
                        comment: "$comment",
                        status: "$status",
                        "updated by": "$updated by",
                        "locked by": "$locked by",
                        "locked at": "$locked at",
                    },
                },
                {
                    $sort: {
                        "Patient ID": 1,
                    },
                }
            ]
        })

        res.send(availableForms)
        // console.log("--------------------------------> DONE")

    } catch (e) {
        res.send({
            error: e.toString(),
            stack: e.stack,
            requestBody: req.body
        })
    }

}


const postSubmitOneExamination = async (req, res) => {
    try {

        const { settings } = req.body
        let { user } = settings 
        const { users } = req.body.cache
        
        let grants = find(users, u => u.email.includes(user.email))
        settings.user = grants

        if (req.eventHub.listenerCount("transfer-clinic-data") == 0) {
            req.eventHub.on("transfer-clinic-data", transferClinicData)
        }

        req.eventHub.emit("transfer-clinic-data", settings)

        res.status(200).send()

    } catch (e) {
        res.status(500).send(e.toString() + e.stack)
        console.log("ERROR: postSubmitOneExamination", e.toString())
    }
}


module.exports = {
    getGrants,
    getForms,
    updateForms,
    syncExaminations,
    getExaminationList,
    lockForms,
    unlockForms,
    syncAssets,
    getRules,
    postSubmitOneExamination
}