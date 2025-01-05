const docdb = require("../utils/docdb")
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
    unionBy,
    chunk
} = require("lodash")

const path = require("path")
const uuid = require("uuid").v4
const axios = require("axios")
const fs = require("fs")
const fsp = require("fs").promises

const s3Bucket = require("../utils/s3-bucket")
const dataService = require("../utils/stethophone-data-service")
const externalWorkflow = require("../utils/external-workflow")

const initMigrateExamination = async settings => {

    let publisher = await externalWorkflow.getPublisher("syncExamination")
    publisher.send(settings)

}    

const config = require("../../.config/ade-clinic")

const TEMP_UPLOAD_DIR = path.resolve(config.UPLOAD_DIR)
const CLINIC_DATABASE = config.CLINIC_DATABASE

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

        let data = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
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


        let data = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
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

            const result = await docdb.replaceOne({
                db: CLINIC_DATABASE,
                collection: `sparrow-clinic.forms`,
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


        let data = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
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
            const result = await docdb.replaceOne({
                db: CLINIC_DATABASE,
                collection: `sparrow-clinic.forms`,
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


        const result = await docdb.replaceOne({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
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

    let availableForms = await docdb.aggregate({
        db: CLINIC_DATABASE,
        collection: `sparrow-clinic.forms`,
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
        
        let assets = await dataService.getExaminationAssets(req.body.options)
        res.send(assets)

    } catch (e) {
        console.log("Sync Assets Error", e.toString(), e.stack, JSON.stringify(req.body))
        throw e
    }    

}


const syncExaminations = async (req, res) => {

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

        let examinations_fb = await dataService.getPatients({
            state: "pending",
            prefixes: grants.patientPrefix
        })

        // console.log("--------------------------------> FB", examinations_fb.map(e => e.patientId))

        let patientRegexp = new RegExp(grants.patientPrefix.map(p => `^${p}`).join("|"))

        let examinations_mg = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
            pipeline: [
                {
                    '$match': {
                        'examination.state': "pending",
                        "examination.patientId":{
                            $regex: patientRegexp
                        }
                    }
                },
                {
                    '$project': {
                        '_id': 0
                    }
                }
            ]
        })

        // console.log("--------------------------------> M1", examinations_mg.map(e => e.examination.patientId))

        let toBeAdded = difference(examinations_fb.map(d => d.patientId), examinations_mg.map(d => d.examination.patientId))
        
        // console.log("---------------------------------- ADD", toBeAdded)

        toBeAdded = examinations_fb.filter( e => toBeAdded.includes(e.patientId))
        
        let forms = []
        
        for( let exam of toBeAdded){
           let form = await dataService.getExaminationForms(exam)
           forms.push(form)     
        }

        let availableForms = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
            pipeline: [{
                    '$match': {
                        'examination.state': "pending",
                        "examination.patientId":{
                            $regex: patientRegexp
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
            
        if (req.eventHub.listenerCount("migrate-clinic-data") == 0) {
            req.eventHub.on("migrate-clinic-data", initMigrateExamination) 
        }

        settings.requestId = uuid()
        console.log(`MIGRATE CLINIC DATA REQUEST: ${settings.requestId} INITIATED BY ${user.name}`)
        
        console.log("user", user)

        if(user.grants && user.grants.submit){
            req.eventHub.emit("migrate-clinic-data", settings)
        } else {
            console.log(`REQUEST: ${settings.requestId} INITIATED BY ${user.name} REJECTED. No permissions.`)
        }
        
        res.status(200).send({
            requestId: settings.requestId
        })

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