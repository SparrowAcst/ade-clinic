const mongodb = require("../utils/mongodb")
const { extend, keys, isFunction } = require("lodash")
const db = require("../../.config/ade-clinic").mongodb


let CACHE = {}
let COLLECTIONS = {}


const init = async collections => {

    console.log(`Init DB Cache:\n${JSON.stringify(db, null, " ")}`)
    COLLECTIONS = collections || COLLECTIONS

    console.log(COLLECTIONS)

    let cacheProperties = keys(COLLECTIONS)

    let res = []

    for (const cacheProperty of cacheProperties) {

        CACHE[cacheProperty] = await mongodb.aggregate({
            db,
            collection: `${db.name}.${COLLECTIONS[cacheProperty].collection}`,
            pipeline: [{
                $project: {
                    _id: 0
                },
            }, ]
        })

        if(COLLECTIONS[cacheProperty].mapper && isFunction(COLLECTIONS[cacheProperty].mapper)){
            CACHE[cacheProperty] = CACHE[cacheProperty].map(d =>  COLLECTIONS[cacheProperty].mapper(d))
        }
        
        console.log(`Load ${CACHE[cacheProperty].length} items from ${db.name}.${COLLECTIONS[cacheProperty].collection} as ${cacheProperty}`)
        res.push(`Load ${CACHE[cacheProperty].length} items from ${db.name}.${COLLECTIONS[cacheProperty].collection} as ${cacheProperty}`)
    }
    return res.join("\n")
}


const handler = async (req, res, next) => {


    if (req.url == "/admin/cache-update/") {
        const stat = await init()
        res.status(200).send(stat)
        return
    }

    if (req.body.forceUpdate) {
        await init()
    }

    const cache = CACHE

    req.body = extend(req.body, { cache})
    req.params = extend(req.params, {cache})
    req.query = extend(req.query, {cache})
    req.dbCache = cache

    next()

}


module.exports = {
    init: async collections => {
        await init(collections)
        return handler
    }
}


