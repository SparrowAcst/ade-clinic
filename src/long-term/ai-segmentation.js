const { extend, isArray } = require("lodash")
const uuid = require("uuid").v4
const axios = require("axios")
const mongodb = require("../utils/mongodb")

const AI_SEGMENTATION_API = "https://eu5zfsjntmqmf7o6ycrcxyry4a0rikmc.lambda-url.us-east-1.on.aws/"

const { db } = require("../../.config/ade-import")


const transformAI2v2 = data => {

    let segments = [
        { ai: "s1", v2: "S1" },
        { ai: "s2", v2: "S2" },
        { ai: "unsegmentable", v2: "unsegmentable" },
        { ai: "s3", v2: "S3" },
        { ai: "s4", v2: "S4" }
    ]

    let res = {}

    if (data.segmentation) {
        segments.forEach(s => {
            if (data.segmentation[s.ai]) {
                res[s.v2] = data.segmentation[s.ai].map(v => [
                    v.start.toFixed(3),
                    v.end.toFixed(3),
                    (["s3", "s4"].includes(s.ai)) ? v.freq_lower.toFixed(3) : '0.000',
                    (["s3", "s4"].includes(s.ai)) ? v.freq_upper.toFixed(3) : '22050.000'
                ])
            }
        })
    }

    res.id = data.id
    res.v2 = true
    res.heart_rate = data.heart_rate
    res.murmur_present = data.murmur_present
    res.quality = data.quality
    res.afib_present = data.afib_present

    return res
}



const getAISegmentation = async settings => {

    let { records } = settings
    if (!records) throw new Error("AI segmentation error: records not defined")

    records = (isArray(records)) ? records : [records]

    let result = []

    for (let r of records) {
        console.log("LONG-TERM: getAISegmentation for ", r.patientId, r["Body Spot"], r.model)
        let segmentation = {
            id: uuid(),
            patientId: r["Examination ID"],
            createdAt: new Date(),
            user: {
                name: "AI"
            },
        }

        try {

            let query

            if (r.Source && r.Source.url) {

                query = {
                    url: r.Source.url
                }


                let response = await axios({
                    method: "POST",
                    url: AI_SEGMENTATION_API,
                    data: query
                })

                let data = response.data

                let id = uuid()

                // data = transformAI2v2(data)

                data.id = id
                segmentation = extend({},
                    segmentation, {
                        id,
                        record: extend({ id: r.id }, query),
                        data
                    }
                )
            }

        } catch (e) {

            segmentation = extend({}, segmentation, {
                error: `${e.toString()}: ${JSON.stringify(e.response.data, null, " ")}`
            })

        }


        result.push(segmentation)

    }

    return result
}

const updateAISegmentation = async settings => {
    

    let { records, user } = settings
    
    const SCHEMA = user.submit.schema    

    console.log(`LONG-TERM: updateAISegmentation: started on ${SCHEMA}`)

///////////////////// debug /////////////////////////    
    // records = records.slice(0,5)
/////////////////////////////////////////////////////

    let segmentations = await getAISegmentation({records})
    
    // console.log(`LONG-TERM: updateAISegmentation: insert ${segmentations.length} items into ${collection.segmentations}`)
    
    // await mongodb.insertAll({
    //     db,
    //     collection: collection.segmentations,
    //     data: segmentations
    // })

    let commands = segmentations
        .filter( s => !s.error)
        .map( s => ({
                        updateOne: {
                            filter: {
                                id: s.record.id
                            },
                            update: {
                                $set:{
                                    aiSegmentation: s.data
                                }
                            },
                            upsert: true
                        }
    }))

    console.log(`LONG-TERM: updateAISegmentation: update ${commands.length} items in ${SCHEMA}.labels`)
    
    if(segmentations.length > commands.length){
        console.log(`LONG-TERM: updateAISegmentation: no segmentation for`, segmentations.filter(s => s.error))
    }

    await mongodb.bulkWrite({
                db,
                collection: `${SCHEMA}.labels`,
                commands
            })
     
    console.log(`LONG-TERM: updateAISegmentation: done`)
    
}




module.exports = {
    getAISegmentation,
    transformAI2v2,
    updateAISegmentation
}