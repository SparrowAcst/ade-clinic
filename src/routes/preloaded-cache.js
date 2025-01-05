const docdb = require("../utils/docdb")
const { extend, keys, isFunction, findIndex } = require("lodash")

let CACHE = {}
let COLLECTIONS = {}
const config = require("../../.config/ade-clinic")
const CLINIC_DATABASE = config.CLINIC_DATABASE


const init = async collections => {

    console.log(`Init DB Cache:\n`)
    COLLECTIONS = collections || COLLECTIONS

    console.log(COLLECTIONS)

    let cacheProperties = keys(COLLECTIONS)

    let res = []

    for (const cacheProperty of cacheProperties) {

        CACHE[cacheProperty] = await docdb.aggregate({
            db: CLINIC_DATABASE,
            collection: `sparrow-clinic.${COLLECTIONS[cacheProperty].collection}`,
            pipeline: [{
                $project: {
                    _id: 0
                },
            }]
        })

        if (COLLECTIONS[cacheProperty].mapper && isFunction(COLLECTIONS[cacheProperty].mapper)) {
            CACHE[cacheProperty] = CACHE[cacheProperty].map(d => COLLECTIONS[cacheProperty].mapper(d))
        }

        console.log(`Load ${CACHE[cacheProperty].length} items from sparrow-clinic.${COLLECTIONS[cacheProperty].collection} as ${cacheProperty}`)
        res.push(`Load ${CACHE[cacheProperty].length} items from sparrow-clinic.${COLLECTIONS[cacheProperty].collection} as ${cacheProperty}`)
    }
    return res.join("\n")
}


const RELOAD = async (req, res, next) => {
    let stat = await init(COLLECTIONS) 
    res.status(200).send(stat)
}    

const PRELOAD = async (req, res, next) => {


    if (req.url == "/admin/cache-update/") {
        const stat = await init(COLLECTIONS)
        res.status(200).send(stat)
        return
    }

    if (req.body.forceUpdate) {
        await init()
    }

    const cache = CACHE

    req.body = extend(req.body, { cache })
    req.params = extend(req.params, { cache })
    req.query = extend(req.query, { cache })
    req.dbCache = cache

    next()

}


const WRITEBACK = async (req, res, next) => {
    try {
        
        let { entity, data } = req.body
        entity = entity || req.params.entity

        if(!entity){
            res.status(403).send(`entity not defined`)
            return   
        }

        if(!CACHE[entity]){
            res.status(403).send(`No cached entity "${entity}"`)
            return   
        }

        let collection = `sparrow-clinic.${COLLECTIONS[entity].collection}`
        let identity = (COLLECTIONS[entity] && COLLECTIONS[entity].writeback) ? COLLECTIONS[entity].writeback.identity : undefined
        
        if (identity) {
            
            let id = data[identity]
            
            if(!id){
                res.status(403).send(`${entity}: no value for identity "${identity}"`)
                return
            }
            
            let index = findIndex(CACHE[entity], c => c[identity] == id)
            if (index > -1) {
                CACHE[entity][index] = data
            } else {
                CACHE[entity].push(data)
            }

            // await 

            docdb.replaceOne({
                db: CLINIC_DATABASE,
                collection,
                filter: {
                    [identity]: id
                },
                data
            })

            res.status(200).send("ok")

        } else {
            res.status(404).send("no writeback identity specification")
        }
    } catch (e) {
        res.status(503).send(e.toString())
    }

}


const LIST = async (req, res, next) => {
    try {
        res.status(200).send(CACHE[req.params.entity])
    } catch (e) {
        res.status(503).send(e.toString())
    }
}



module.exports = {
    init: async collections => {
        await init(collections)
        return {
            RELOAD,
            PRELOAD,
            WRITEBACK,
            LIST
        }
    }
}