const { extend, isArray } = require("lodash")
const mongodb = require("../utils/mongodb")

const { db, encodeDB } = require("../../.config/ade-import")

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let patientRules = [

    d => {
        if (d.heart_failure_choice && d.heart_failure_choice == "Yes") return `Heart Failure: <b>${d.heart_failure_choice}</b>`
        return false
    },

    d => {
        if (d.atrial_fibrillation_definition && d.atrial_fibrillation_definition == "Present") return `At the moment of heart sound recording Atrial fibrillation is: <b>${d.atrial_fibrillation_definition}</b>`
        return false
    },

    d => {
        if (d.af_definition && d.af_definition == "Present") return `At the moment of heart sound recording, AF is: <b>${d.af_definition}</b>`
        return false
    },

    d => {
        if (d.pulmonary_hypertension && d.pulmonary_hypertension == "Yes") return `Pulmonary hypertension: <b>${d.pulmonary_hypertension}</b>`
        return false
    },

    d => {
        if (d.pulmonary_embolism && ["acute", "chronic", "acute in the past"].includes(d.pulmonary_embolism)) return `Pulmonary Embolism: <b>${d.pulmonary_embolism}</b>`
        return false
    },

    d => {
        if (d.cardiomyopathy_type && ["Hypertrophic Obstructive", "Hypertrophic Non-Obstructive"].includes(d.cardiomyopathy_type)) return `Cardiomyopathy Type: <b>${d.cardiomyopathy_type}</b>`
        return false
    },
]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let echoRules = [

    d => {
        if (d.aortic_dissection && ["DeBakey I", "DeBakey II", "DeBakey III"].includes(d.aortic_dissection)) return `Aortic dissection: <b>${d.aortic_dissection}</b>`
        return false
    },

    d => {
        if (d.ef && d.ef <= 40) return `EF (apical access, 4-chamber position, Simpson algorithm): <b>${d.ef}</b>`
        return false
    },

    d => {
        if (d.mitral_regurgitation_stage && [
                "B Progressive",
                "C1 Asymptomatic severe (LVEF > 60% and LVESD < 40mm)",
                "C2 Asymptomatic severe (LVEF < 60% and LVESD > 40mm)",
                "D Symptomatic severe",
                "Undefined",
                "Acute"
            ].includes(d.mitral_regurgitation_stage)) return `Mitral regurgitation stage: <b>${d.mitral_regurgitation_stage}</b>`
        return false
    },

    d => {
        if (d.mitral_stenosis_stage && [
                "B Progressive MS",
                "C Asymptomatic severe MS",
                "D Symptomatic severe MS"
            ].includes(d.mitral_stenosis_stage)) return `Mitral stenosis stage: <b>${d.mitral_stenosis_stage}</b>`
        return false
    },

    d => {
        if (d.aortic_regurgitation_stage && [
                "B Progressive Moderate AR",
                "C1 Asymptomatic severe AR, LVEF ≥ 50%, LVESD ≤ 50mm",
                "C2 Asymptomatic severe AR, LVEF < 50%, LVESD > 50mm",
                "D Symptomatic severe AR"
            ].includes(d.aortic_regurgitation_stage)) return `Aortic regurgitation stage: <b>${d.aortic_regurgitation_stage}</b>`
        return false
    },

    d => {
        if (d.aortic_stenosis_stage && [
                "B - Progressive moderate",
                "C1 - Asymptomatic severe with normal EF",
                "C2 - Asymptomatic severe with low EF",
                "D1 - Symptomatic severe High gradient",
                "D2 - Symptomatic severe LG reduced EF",
                "D3 - Symptomatic severe LG normal EF"
            ].includes(d.aortic_stenosis_stage)) return `Aortic stenosis stage: <b>${d.aortic_stenosis_stage}</b>`
        return false
    },

    d => {
        if (d.tricuspid_regurgitation_stage && [
                "B - Progressive TR Moderate",
                "C - Asymptomatic severe TR",
                "D - Symptomatic severe TR",
                "Undefined"
            ].includes(d.tricuspid_regurgitation_stage)) return `Tricuspid regurgitation stage: <b>${d.tricuspid_regurgitation_stage}</b>`
        return false
    },

    d => {
        if (d.pulmonary_regurgitation_stage && [
                "Moderate",
                "Severe"
            ].includes(d.pulmonary_regurgitation_stage)) return `Pulmonary regurgitation stage: <b>${d.pulmonary_regurgitation_stage}</b>`
        return false
    },

    d => {
        if (d.pulmonary_stenosis && d.pulmonary_stenosis == "Present") return `Pulmonary stenosis: <b>${d.pulmonary_stenosis}</b>`
        return false
    },

    d => {
        if (d.congenital_heart_disease && d.congenital_heart_disease == "Yes") return `Congenital heart disease: <b>${d.congenital_heart_disease}</b>`
        return false
    },

]

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkRules = data => {

    let result = patientRules.map(r => r(data.patient)).concat(echoRules.map(r => r(data.echo))).filter(r => r != false)
    return (result.length == 0) ? false : result


}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const sapRules = [

    d => {
        if (d.patient.atrial_fibrillation && d.patient.atrial_fibrillation == "Yes") return `Atrial fibrillation: <b>${d.patient.atrial_fibrillation}</b>`
        return false
    },

    d => {
        if (d.patient.atrial_fibrillation_definition && d.patient.atrial_fibrillation_definition == "Present") return `At the moment of heart sound recording, AF is: <b>${d.patient.atrial_fibrillation_definition}</b>`
        return false
    },

    d => {
        if (d.patient.atrial_flutter && d.patient.atrial_flutter == "Yes") return `Atrial flutter: <b>${d.patient.atrial_flutter}</b>`
        return false
    },

    d => {
        if (d.patient.af_definition && d.patient.af_definition == "Present") return `At the time of heart sound recording, Atrial Flutter is: <b>${d.patient.af_definition}</b>`
        return false
    },

    d => {
        if (d.ekg.rhythm && _.intersection(["SV extrasystole", "V extrasystole", "undetermined extrasystole"], d.ekg.rhythm)) return `Rhythm: <b>${_.intersection(["SV extrasystole","V extrasystole","undetermined extrasystole"],d.ekg.rhythm).join(", ")}</b>`
        return false
    },

]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkSapRules = data => {
    let result = sapRules.map(r => r(data)).filter(r => r != false)
    return (result.length == 0) ? false : result
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkAcceptanceCriteria = v => (v.protocol == "Complete Protocol" || !v.protocol) ? checkRules(v) : checkSapRules(v)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkRecordsQuality = records => ((records.filter(r => r.qty == "bad").length) / records.length) < 0.1

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const acceptExamination = async (examination, SCHEMA) => {

    console.log(`LONG-TERM: autoaccept: for ${examination.patientId} on ${SCHEMA} - ACCEPT`)

    console.log(`LONG-TERM: autoaccept: update ${SCHEMA}.examinations`)

    await mongodb.updateOne({
        db,
        collection: `${SCHEMA}.examinations`,
        filter: {
            id: examination.id
        },
        data: {
            patientId: null,
            state: "accepted",
            updatedAt: new Date(),
            updatedBy: "AUTO ACCEPT"
        }
    })

    console.log(`LONG-TERM: autoaccept: update ${SCHEMA}.labels`)

    await mongodb.updateMany({
        db,
        collection: `${SCHEMA}.labels`,
        filter: {
            id: {
                $in: examination.records.map(r => r.id)
            }
        },
        data: {
            patientId: null
        }
    })

    console.log(`LONG-TERM: autoaccept: update ADE-ENCODING.${SCHEMA}-patients`)

    await mongodb.replaceOne({
        db: encodeDB,
        collection: `ADE-ENCODING.${SCHEMA}-patients`,
        filter: {
            id: examination.id
        },
        data: {
            id: examination.id,
            patientId: examination.patientId
        }
    })

}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const autoAccept = async settings => {

    let { patientId, user } = settings
    const SCHEMA = user.submit.schema

    try {
        
        console.log(`LONG-TERM: autoaccept: started for ${patientId} on ${SCHEMA}`)

        const pipeline = [{
                $match: {
                    patientId,
                },
            },
            {
                $lookup: {
                    from: "labels",
                    localField: "id",
                    foreignField: "examinationId",
                    as: "records",
                    pipeline: [{
                            $match: {
                                "Body Spot": {
                                    $in: [
                                        "Apex",
                                        "Tricuspid",
                                        "Pulmonic",
                                        "Aortic",
                                        "Right Carotid",
                                        "Erb's",
                                        "Erb's Right",
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                id: 1,
                                qty: "$aiSegmentation.quality",
                            },
                        },
                    ],
                },
            },
        ]

        let examination = await mongodb.aggregate({
            db,
            collection: `${SCHEMA}.examinations`,
            pipeline
        })

        examination = examination[0]

        // console.log(examination)

        if(examination && checkAcceptanceCriteria(examination.forms) && checkRecordsQuality(examination.records)){
        await acceptExamination(examination, SCHEMA)
        } else {
            console.log(`LONG-TERM: autoaccept: for ${patientId} on ${SCHEMA} - NO ACCEPTANCE CRITERIA`)
        }

        console.log(`LONG-TERM: autoaccept: for ${patientId} on ${SCHEMA} done`)

    } catch (e) {
        console.log(`LONG-TERM: autoaccept: for ${patientId} on ${SCHEMA} error`, e.toString(), e.stack)
    }

}


module.exports = autoAccept