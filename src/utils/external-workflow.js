
const { AmqpManager, Middlewares } = require('@molfar/amqp-client')
const config = require("../../.config/ade-import").rabbitmq.TEST
const nodeCache = require("node-cache")
const uuid = require("uuid").v4

const PUBLISHERS = {}
const CONSUMERS = {}

const CACHE = new nodeCache({
    stdTTL: 1*60*60, 
    checkperiod: 5*60 
}) // Time to Life = 1*60*60 = 1 hours, Check Period: 5*60 = 5 min


const getPublisher  = async alias => {
    
    if(!PUBLISHERS[alias]){
        PUBLISHERS[alias] = await AmqpManager.createPublisher(config.publisher[alias])
        PUBLISHERS[alias]
            .use((err, msg, next)=> {
                CACHE.set(uuid(), {
                    alias,
                    date: new Date(),
                    status: "send",
                    data: msg.content
                })
                next()
            })
            .use(Middlewares.Json.stringify)
    }

    return PUBLISHERS[alias]

}


const getConsumer  = async alias => {
    
    if(!CONSUMERS[alias]){
        
        CONSUMERS[alias] = await AmqpManager.createConsumer(config.consumer[alias])
        
        await CONSUMERS[alias]
                .use(Middlewares.Json.parse)

                .use((err, msg, next) => {
                    msg.ack()
                    next()
                })
                .use((err, msg, next)=> {
                    CACHE.set(uuid(), {
                        alias,
                        date: new Date(),
                        status: "receive",
                        data: msg.content
                    })
                })


        .start()
    }

    return CONSUMERS[alias]

} 

const getMessages = criteria => {
    let messages = CACHE.keys().map( key => CACHE.get(key))
    criteria = criteria || (() => true)
    console.log("!!", criteria)
    return messages.filter(criteria)
}    


module.exports = {
    getConsumer,
    getPublisher,
    getMessages
}
