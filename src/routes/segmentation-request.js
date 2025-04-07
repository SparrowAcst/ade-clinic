const NodeCache = require("node-cache")
const uuid = require("uuid").v4

const CACHE = new NodeCache({
    useClones: false,
    stdTTL: 1 * 60,
    checkperiod: 1 * 60
})


const openRequest = (req, res) => {

    try {
        const { record, patient, user } = req.body

        let id = uuid()

        const request = {
            id,
            data: {
                "patientId": patient,
                "quality": record.quality,
                "recordId": record.uuid,
                "spot": record.spot,
                "position": record.bodyPosition,
                "device": record.device,
                "Systolic murmurs": [],
                "Diastolic murmurs": [],
                "Other murmurs": [],
                "inconsistency": [],
                "data": [{
                    "user": user,
                    "readonly": true,
                    "segmentation": []
                }]
            }
        }

        CACHE.set(id, request)
        // console.log("keys",CACHE.keys())
        // console.log("CREATED REQUEST", id, CACHE.get(id))
        res.send({
            requiestId: id
        })

    } catch(e) {
        res.send(`${e.toString()} ${e.stack}`)
    }    

}

const getRequest = (req, res) => {

    try {
        
        let requestId = req.query.requestId || req.params.requestId || (req.body && req.body.requestId)
        console.log("requestId", requestId)
        
        // CACHE.keys().forEach( k => {
        //     console.log("CACHED REQUEST", k, CACHE.get(k))
        // })

        if( CACHE.has(requestId)){
            let result = CACHE.get(requestId)
            res.send(result.data)
        } else {
            res.status(404).send(`Request ${requestId} not found`)
        }

    } catch(e) {
        res.send(`${e.toString()} ${e.stack}`)
    }     

}

const saveRequest = (req, res) => {

    try {
        
        res.status(403).send(`All Requests is readonly for this application`)

    } catch(e) {
        res.send(`${e.toString()} ${e.stack}`)
    }     

}


module.exports = {
    openRequest,
    getRequest,
    saveRequest
}