const docdb = require("../utils/docdb")
const { extend, groupBy, keys } = require("lodash")

const config = require("../../.config/ade-clinic")
const CLINIC_DATABASE = config.CLINIC_DATABASE
const ADE_DATABASE = config.ADE_DATABASE



const buildBasicPipeline = options => {
    let matchExaminationPipeline = options.matchExamination || []

    let pipeline = [{
            $match: {
                adeStatus: {
                    $exists: true
                },
            },
        },
        {
            $lookup: {
                from: "organizations",
                localField: "siteId",
                foreignField: "id",
                as: "result",
            },
        },
        {
            $addFields: {
                org: {
                    $arrayElemAt: ["$result", 0],
                },
            },
        },
        {
            $addFields: {
                org: "$org.alias",
                patientId: "$examination.patientId",
            },
        }
    ].concat(matchExaminationPipeline)

    return pipeline
}


const getStateChart = async (req, res) => {

    try {

        let pipeline = buildBasicPipeline(req.body.options).concat([{
                $project: {
                    state: "$adeStatus",
                },
            },
            {
                $group: {
                    _id: "$state",
                    patients: {
                        $push: 1,
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    label: "$_id",
                    value: {
                        $size: "$patients",
                    },
                },
            }
        ])

        let data = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
            pipeline
        })

        res.send({
            options: req.body.options,
            pipeline,
            values: data
        })

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }

}

const getExams = async (req, res) => {

    try {

        let { options } = req.body
        let limit = options.limit || 100

        let pipeline = buildBasicPipeline(options).concat(
            [{
                    $sort: {
                        submitedAt: -1,
                        patientId: -1
                    }
                },
                {
                    $limit: Number.parseInt(limit)
                },
                {
                    $project: {
                        _id: 0
                    }
                }
            ]
        )


        let data = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
            pipeline
        })

        res.send({
            options,
            pipeline,
            collection: data
        })


    } catch (e) {
        console.log(e.toString(), e.stack)
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const getSelectedExaminations = async selection => {
    let result = docdb.aggregate({
        db: CLINIC_DATABASE,
        collection: "sparrow-clinic.forms",
        pipeline: [{
                $match: {
                    "examination.patientId": {
                        $in: selection
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
    return result
}

const updateExaminations = async ({ selection, user, adeStatus }) => {

    if (selection.length == 0) return
    adeStatus = adeStatus || "inReview"

    let updates = groupBy(selection, s => s.schema)

    let groupedCommands = keys(updates).map(key => {

        return {
            schema: key,
            commands: updates[key].map(d => ({
                updateOne: {
                    filter: {
                        id: d.uuid
                    },
                    update: {
                        $set: {
                            state: adeStatus,
                            updatedAt: new Date(),
                            updatedBy: {
                                user: user.grants.name,
                                role: user.grants.role
                            }
                        }
                    }
                }
            }))
        }

    })

    for (const u of groupedCommands) {
        console.log(`Update state for ${u.commands.length} items in ADE: ${u.schema}.examinations`)
        if (u.commands.length > 0) {
            await docdb.bulkWrite({
                db: ADE_DATABASE,
                collection: `${u.schema}.examinations`,
                commands: u.commands
            })
        }
    }

}

const updateClinicExaminations = async ({ selection, user, adeStatus }) => {

    if (selection.length == 0) return
    adeStatus = adeStatus || "inReview"

    let commands = selection.map(d => {
        return {
            updateOne: {
                filter: {
                    uuid: d.uuid
                },
                update: {
                    $set: {
                        adeStatus,
                        updatedAt: new Date(),
                        updatedBy: {
                            user: user.grants.name,
                            role: user.grants.role
                        }
                    }
                }
            }
        }
    })

    console.log(`Update state for ${commands.length} items in CLINIC: sparrow-clinic.forms`)

    if (commands.length > 0) {
        await docdb.bulkWrite({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.forms`,
            commands
        })
    }

}


const acceptExaminations = async (req, res) => {
    try {

        let { selection, user } = req.body.options
        if (selection.length == 0) return

        selection = await getSelectedExaminations(selection)

        await updateExaminations({
            selection,
            user,
            adeStatus: "accepted"
        })

        await updateClinicExaminations({
            selection,
            user,
            adeStatus: "accepted"
        })


        res.status(200).send("ok")

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const rejectExaminations = async (req, res) => {
    try {

        let { selection, user } = req.body.options

        if (selection.length == 0) return

        selection = await getSelectedExaminations(selection)

        await updateExaminations({
            selection,
            user,
            adeStatus: "rejected"
        })

        await updateClinicExaminations({
            selection,
            user,
            adeStatus: "rejected"
        })

        res.status(200).send("ok")

    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


module.exports = {
    getExams,
    getStateChart,
    acceptExaminations,
    rejectExaminations
}