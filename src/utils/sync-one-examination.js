const moment = require("moment")
const path = require("path")
const { find, sortBy, filter, extend, isUndefined, isNull, isArray } = require("lodash")
const { loadYaml, pathExists } = require("../utils/file-system")
const uuid = require("uuid").v4
const mongodb = require("./mongodb")
const fb = require("./fb")
const s3bucket = require("./s3-bucket")

const adeDB = require("../../.config/ade-import").db
const encodeDB = require("../../.config/ade-import").encodeDB

const clinicDB = require("../../.config/ade-clinic").mongodb


const s3 = require("../../.config/ade-clinic").s3

const getSubmitedForm = async patientId => {

    data = await mongodb.aggregate({
        db: clinicDB,
        collection: `${clinicDB.name}.forms`,
        pipeline: [{
                $match: {
                    "examination.patientId": patientId
                }
            },
            {
                $project: {
                    _id: 0
                }
            }
        ]
    })

    return data[0]
}

const buildExaminationCommand = data => {


    let result = {
        id: data.id,
        actorId: data.user.id,
        patientId: data.examination.patientId,
        protocol: data.protocol,
        state: "inReview",
        comment: data.examination.comment,
        createdAt: new Date(data.examination.dateTime),
        submitedAt: new Date(),
        forms: {
            patient: {
                type: "patient",
                data: data.patient || {}
            },
            echo: {
                type: "echo",
                data: data.echo || {}
            },
            ekg: {
                type: "ekg",
                data: data.ekg || {}
            },
            attachements: {
                type: "attachements",
                data: data.attachements || []
            }
        }
    }


    return [{
        replaceOne: {
            "filter": { patientId: result.patientId },
            "replacement": result,
            "upsert": true
        }
    }]

}

const spotMap = {
    mitral: "Apex",
    tricuspid: "Tricuspid",
    pulmonic: "Pulmonic",
    aortic: "Aortic",
    rightCarotid: "Right Carotid",
    leftCarotid: "Left Carotid",
    erbs: "Erb's",
    erbsRight: "Erb's Right",
    lowerBackLeft: "Left Lower Lung",
    lowerBackRight: "Right Lower Lung",
    middleBackLeft: "Middle back left",
    middleBackRight: "Middle back right",
    rightAbdomen: "Right abdomen",
    leftAbdomen: "Left abdomen",
}

const buildRecordCommands = data => {

    let res = data.recordings.map(d => ({
        "id": uuid(),
        "patientId": data.examination.patientId,
        "examinationId": data.id,
        "Source": d.Source,
        "Age (Years)": data.patient.age,
        "Sex at Birth": data.patient.sex_at_birth,
        "Ethnicity": data.patient.ethnicity,
        "model": d.device,
        "deviceDescription": d.deviceDescription,
        "Body Position": d.bodyPosition,
        "Body Spot": spotMap[d.spot],
        "Type of artifacts , Artifact": [],
        "Systolic murmurs": [],
        "Diastolic murmurs": [],
        "Other murmurs": [],
        "Pathological findings": [],
        "path": d.Source.path,
        "Lung Sound Informativeness": "Non assessed",
        "taskList": []
    }))

    return res.map(d => ({
        replaceOne: {
            "filter": {

                "patientId": d.patientId,
                "Body Position": d["Body Position"],
                "Body Spot": d["Body Spot"],
                "model": d.model

            },
            "replacement": d,
            "upsert": true
        }
    }))
}



const saveEncoding = async (data, SCHEMA) => {

    data = data || []
    data = isArray(data) ? data : [data]

    if (data.length > 0) {
        await mongodb.bulkWrite({
            db: encodeDB,
            collection: `ADE-ENCODING.${SCHEMA}-files`,
            commands: data.map(d => ({
                replaceOne: {
                    "filter": {

                        "path": d.path
                    },
                    "replacement": d,
                    "upsert": true
                }
            }))
        })
    }
}


const resolveAttachements = async (data, SCHEMA) => {
    if (data.attachements) {

        let encoding = []

        for (let a of data.attachements) {
            const source = a.path
            const encodedFileName = `${uuid()}${path.extname(a.name)}`
            const destination = `${s3.root.files}/${encodedFileName}`
            await s3bucket.copyObject({ source, destination })
            console.log(`${source} > ${destination}`)
            encoding.push({
                path: destination,
                ref: source
            })
            a.name = encodedFileName
            a.publicName = encodedFileName
            a.path = destination
            a.url = await s3bucket.getPresignedUrl(a.path)
        }

        await saveEncoding(encoding, SCHEMA)
    }
    return data
}


const resolveEcho = async (data, SCHEMA) => {
    if (data.echo && data.echo.dataUrl) {
        const source = data.echo.dataPath
        const encodedFileName = `${uuid()}${path.extname(data.echo.dataFileName)}`
        const destination = `${s3.root.echos}/${encodedFileName}`
        await s3bucket.copyObject({ source, destination })
        console.log(`${source} > ${destination}`)
        data.echo.dataFileName = encodedFileName
        data.echo.dataPath = destination
        data.echo.dataUrl = await s3bucket.getPresignedUrl(data.echo.dataPath)

        await saveEncoding({ path: destination, ref: source }, SCHEMA)

    }
    return data
}




module.exports = async settings => {

    try {

        const { protocol, organization, patientId, state, user } = settings

        const SCHEMA = user.submit.schema || "CLINIC-UNDEFINED-SCHEMA"

        let examination = await getSubmitedForm(patientId)
        if (!examination) return

        examination = await resolveAttachements(examination, SCHEMA)
        examination = await resolveEcho(examination, SCHEMA)
        examination = extend(examination, { id: uuid(), protocol, user })


        // import examination
        const examinationCommands = buildExaminationCommand(examination)

        if (examinationCommands.length > 0) {
            await mongodb.bulkWrite({
                db: adeDB,
                collection: `${SCHEMA}.examinations`,
                commands: examinationCommands
            })
        }

        // import records
        const recordCommands = buildRecordCommands(examination)

        if (recordCommands.length > 0) {
            await mongodb.bulkWrite({
                db: adeDB,
                collection: `${SCHEMA}.labels`,
                commands: recordCommands
            })
        }



        // // finalize in fb

        // let batch = fb.db.batch()

        // try {

        //     let doc = fb.db.collection("examinations").doc(examination.examination.id)
        //     batch.update(doc, { state: "inReview" })
        //     await batch.commit()

        // } catch (e) {

        //     console.log(e.toString())

        // }



        // // finalize in clinic

        // await mongodb.updateOne({
        //     db: clinicDB,
        //     collection: `${clinicDB.name}.forms`,
        //     filter:{"examination.patientId": patientId},
        //     data: {
        //         "examination.state": "finalized",
        //         "status": "finalized"
        //     }
        // })


        return {
            records: recordCommands.map(d => d.replaceOne.replacement)
        }
    } catch (e) {
        console.log(e.toString(), e.stack)
    }
}