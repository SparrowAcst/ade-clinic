const moment = require("moment")
const path = require("path")
const { find, sortBy, filter, extend, isUndefined, isNull } = require("lodash")
const { loadYaml, pathExists } = require("../utils/file-system")
const uuid = require("uuid").v4
const mongodb = require("./mongodb")
const fb = require("./fb")

const adeDB = require("../../.config/ade-import").db

const clinicDB = require("../../.config/ade-clinic").mongodb


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

const buildFormCommands = data => {

    let formRecords = []

    if (data.patient) {
        formRecords.push({
            id: uuid(),
            data: {
                en: data.patient,
                uk: data.patient
            },
            type: "patient",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    } else {
        formRecords.push({
            id: uuid(),
            data: {
                en: {},
                uk: {}
            },
            type: "patient",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    }

    if (data.ekg) {
        formRecords.push({
            id: uuid(),
            data: {
                en: data.ekg,
                uk: data.ekg
            },
            type: "ekg",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    } else {
        formRecords.push({
            id: uuid(),
            data: {
                en: {},
                uk: {}
            },
            type: "ekg",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    }

    if (data.echo) {
        formRecords.push({
            id: uuid(),
            data: {
                en: data.echo,
                uk: data.echo
            },
            type: "echo",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    } else {
        formRecords.push({
            id: uuid(),
            data: {
                en: {},
                uk: {}
            },
            type: "echo",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    }

    if (data.attachements) {
        formRecords.push({
            id: uuid(),
            data: data.attachements,
            type: "attachements",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    } else {
        formRecords.push({
            id: uuid(),
            data: [],
            type: "attachements",
            examinationId: data.examination.id,
            patientId: data.examination.patientId
        })
    }

    return formRecords.map(f => ({
        replaceOne: {
            "filter": { 
                patientId: f.patientId,
                type: f.type 
            },
            "replacement": f,
            "upsert": true
        }
    }))
}

const buildExaminationCommand = data => {
    
    let examination = data.examination
    examination.state = "inReview"
    examination.protocol = data.protocol
    examination.org = data.organization
    examination.synchronizedAt = new Date()
    examination.actorId = data.fbActor.userId
    examination.organization = data.fbOrganization.id
    
    return [{
        replaceOne: {
            "filter": { patientId: examination.patientId },
            "replacement": examination,
            "upsert": true
        }
    }]

}

const buildActorCommand = data => {
    
    return [{
        replaceOne: {
            "filter": { id: data.fbActor.userId },
            "replacement": data.fbActor,
            "upsert": true
        }
    }]

}

const buildOrgCommand = data => {

    return [{
        replaceOne: {
            "filter": { id: data.fbOrganization.userId },
            "replacement": data.fbOrganization,
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
        "Examination ID": data.examination.patientId,
        "Source": d.Source,
        "Clinic": data.user.submit.clinic,
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
        "state": "Assign 2nd expert",
        "CMO": "Yaroslav Shpak",
        "TODO": "Assign 2nd expert",
        "updated at": new Date(),
        "updated by": "import utils",
        "Stage Comment": "Added by import utils",
        "assigned to": "Oleh Shpak",
        "Lung Sound Informativeness": "Non assessed",
    }))

    return res.map(d => ({
        replaceOne: {
            "filter": { 

                "Examination ID": d["Examination ID"],
                "Body Position": d["Body Position"],
                "Body Spot": d["Body Spot"],
                "model": d.model

            },
            "replacement": d,
            "upsert": true
        }
    }))
}


module.exports = async settings => {

    const { protocol, organization, patientId, state, user } = settings
    const collection = adeDB.collection[organization] || adeDB.collection["default"]

    let examination = await getSubmitedForm(patientId)
    if (!examination) return

    let fbActor = await fb.getCollectionItems("users",[["patientIdPrefix", "==", patientId.substring(0,3)]])    
    fbActor = fbActor[0]
    let fbOrganization
    
    if(fbActor){
        fbOrganization = await fb.getOrganization(fbActor.organization)
    }

    examination = extend(examination, { protocol, organization, user, fbActor, fbOrganization })

    // import actor
    const actorCommands = (fbActor) ? buildActorCommand(examination) : []
    // console.log("actorCommands", JSON.stringify(actorCommands, null, " "))
    
    console.log(`ADE IMPORT ${patientId}: insert into ${collection.users} ${actorCommands.length} items`)

    if(actorCommands.length > 0){
        await mongodb.bulkWrite({
                db: adeDB,
                collection: collection.users,
                commands: actorCommands
            })
    }

    // import organization
    const orgCommands = (fbOrganization) ? buildOrgCommand(examination) : []
    // console.log("orgCommands", JSON.stringify(orgCommands, null, " "))
    console.log(`ADE IMPORT ${patientId}: insert into ${collection.organizations} ${orgCommands.length} items`)

    if(orgCommands.length > 0){
        await mongodb.bulkWrite({
                db: adeDB,
                collection: collection.organizations,
                commands: orgCommands
            })
    }

    // import examination
    const examinationCommands = buildExaminationCommand(examination)
    // console.log("examinationCommands", JSON.stringify(examinationCommands, null, " "))

    console.log(`ADE IMPORT ${patientId}: insert into ${collection.examinations} ${examinationCommands.length} items`)
    
    if(examinationCommands.length > 0){
        await mongodb.bulkWrite({
                db: adeDB,
                collection: collection.examinations,
                commands: examinationCommands
            })
    }

    // import forms
    const formCommands = buildFormCommands(examination)
    // console.log("formCommands", JSON.stringify(formCommands, null, " "))

    if(formCommands.length > 0){
        await mongodb.bulkWrite({
                db: adeDB,
                collection: collection.forms,
                commands: formCommands
            })
    }
    
    // import records
    const recordCommands = buildRecordCommands(examination)
    // console.log("recordCommands", JSON.stringify(recordCommands, null, " "))
    console.log(`ADE IMPORT ${patientId}: insert into ${collection.labels} ${recordCommands.length} items`)
    
    if(recordCommands.length > 0){
        await mongodb.bulkWrite({
                db: adeDB,
                collection: collection.labels,
                commands: recordCommands
            })
    }
    


    // finalize in fb

    let batch = fb.db.batch()

    try {

        let doc = fb.db.collection("examinations").doc(examination.examination.id)
        batch.update(doc, { state: "inReview" })
        await batch.commit()

    } catch (e) {

        console.log(e.toString())

    }



    // finalize in clinic

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
        collection,
        records: recordCommands.map(d => d.replaceOne.replacement)
    }
}