const {

    extend,
    find,
    isArray,
    maxBy,
    minBy,
    keys,
    last,
    flatten

} = require("lodash")

const path = require("path")
const uuid = require("uuid").v4
const filesize = require("file-size")
const s3Bucket = require("./s3-bucket")
const fb = require("./fb")
const docdb = require("./docdb")

const config = require("../../.config/ade-clinic")
const CLINIC_DATABASE = config.CLINIC_DATABASE





const getPatients = async options => {

    let { state, prefixes } = options

    let lastExamination = await docdb.aggregate({
        db: CLINIC_DATABASE,
        collection: "sparrow-clinic.external-examinations",
        pipeline: [{
                $sort: {
                    dateTime: -1
                }
            },
            {
                $limit: 1
            },
            {
                $project: {
                    _id: 0
                }
            }
        ]
    })

    let lastDate = (lastExamination[0]) ? lastExamination[0].dateTime : undefined
    // console.log(lastDate)
    let result

    if (lastDate) {
        result = await fb.getCollectionItems(
            "examinations",
            [
                ["dateTime", ">", lastDate]
            ]
        )
    } else {

        result = await fb.getCollectionItems("examinations")

    }

    console.log(`Add ${result.length} items into sparrow-clinic.external-examinations`)

    if (result.length > 0) {
        await docdb.insertAll({
            db: CLINIC_DATABASE,
            collection: "sparrow-clinic.external-examinations",
            data: result
        })
    }

    let patientRegexp = new RegExp(prefixes.map(p => `^${p}`).join("|"))

    let dateTimes = await docdb.aggregate({
        db: CLINIC_DATABASE,
        collection: "sparrow-clinic.forms",
        pipeline: [{
                $match: {
                    "examination.patientId": {
                        $regex: patientRegexp,
                    },
                },
            },
            {
                $addFields: {
                    prefix: {
                        $substr: [
                            "$examination.patientId",
                            0,
                            3,
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: "$prefix",
                    dateTime: {
                        $max: "$examination.dateTime",
                    },
                },
            },
        ]
    })

    console.log(dateTimes)
    
    result = flatten(
        (await Promise.all(dateTimes.map( d => 
                docdb.aggregate({
                    db: CLINIC_DATABASE,
                    collection: `sparrow-clinic.external-examinations`,
                    pipeline: [{
                            $match: {
                                state: state,
                                patientId: {
                                    $regex: d._id
                                },
                                "dateTime":{
                                    $gt: d.dateTime
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0
                            }
                        }
                    ]
                })
            )
        ))
    )

    return result
}


const getExaminationForms = async examination => {

    // examination = await fb.expandExaminations(...[examination])

    // examination = (isArray(examination)) ? examination[0] : examination

    // let formRecords = examination.$extention.forms.map(f => {
    //     let res = extend({}, f)
    //     res.examinationId = examination.id
    //     let key = maxBy(keys(f.data))
    //     res.data = res.data[key]
    //     res.id = f.id
    //     return res
    // })


    // let form = {}
    // let ftypes = ["patient", "ekg", "echo"]
    // ftypes.forEach(type => {
    //     let f = find(formRecords, d => d.type == type)
    //     form[type] = (f && f.data) ? f.data.en : {}

    // })

    form = {
        patient: {},                                                                                                            
        ekg: {},                                                                                                                
        echo: {}, 
        examination: {
            "id": examination.id,
            "dateTime": examination.dateTime,
            "patientId": examination.patientId,
            "comment": examination.comment,
            "state": examination.state
        }
    }    

    return form

}


const getExaminationAssets = async options => {

    try {

        let { examinationID, grants, eid } = options

        let assets = await fb.getFbAssets1(examinationID)

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

        let updtedAssets = []

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

            updtedAssets.push({
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

        assets.files = updtedAssets

        return assets

    } catch (e) {
        console.log("Get Examination Assets Error", e.toString(), e.stack)
        throw e
    }

}


module.exports = {
    getPatients,
    getExaminationForms,
    getExaminationAssets
}