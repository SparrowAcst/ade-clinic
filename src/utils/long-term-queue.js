const Queue = require("queue-promise")
const uuid = require("uuid").v4
const moment = require("moment")
const { keys } = require("lodash")

let queue
let pool = {}

const EXPIRAION = [5, "seconds"]


const initiate = () => {

    console.log("INITIATE LONG TERM")

    queue = new Queue({
        concurrent: 1,
        interval: 2
    })

    queue.on("start", () => {
        console.log(`LONG TERM QUEUE started at ${new Date()}`)
    })

    queue.on("stop", () => {
        console.log(`LONG TERM QUEUE stoped at ${new Date()}`)
    })

    queue.on("resolve", data => {})

    queue.on("reject", error => {})

    queue.start()
}


const removeExpiredTask = section => {
    try {
        if (!pool[section]) return
        let tasks = keys(pool[section])
        tasks.forEach(task => {
                
            if (
                pool[section][task].status == "done" &&
                pool[section][task].expiredAt &&
                moment(new Date()).isSameOrAfter(moment(pool[section][task].expiredAt))
            ) {
                console.log("delete", section, task)
                delete pool[section][task]
            }
        })
    } catch (e) {
        console.log(e.toString(), e.stack)
    }

}


const startTask = (section, id, metadata) => {
    try {
        removeExpiredTask(section)
        pool[section] = pool[section] || {}
        pool[section][id] = {
            id,
            metadata,
            status: "started", 
            expiredAt: null
        }
        return pool[section][id]
        // console.log("START TASK LONG TERM TASK POOL", pool)
    } catch (e) {
        console.log(e.toString(), e.stack)
    }
}

const stopTask = (section, id) => {
    try {
        removeExpiredTask(section)
        pool[section] = pool[section] || {}
        pool[section][id] = {
            id,
            status: "done",
            metadata: (pool[section][id]) ? pool[section][id].metadata : undefined,
            version: uuid(),
            expiredAt: moment(new Date()).add(...EXPIRAION).toDate()
        }
        // console.log("STOP TASK LONG TERM TASK POOL", pool)
    } catch (e) {
        console.log(e.toString(), e.stack)
    }
}

const getTask = (section, id) => {
    try {
        removeExpiredTask(section)
        if (!pool[section]) return {}
        if (!pool[section][id]) return {}
        let res = pool[section][id]
        return res
    } catch (e) {
        console.log(e.toString(), e.stack)
    }
}

const selectTask = (section, test) => {
    try {
        if(!test) return pool[section]
        let res = []
        keys(pool[section]).forEach(id => {
            if (test(pool[section][id])) res.push(pool[section][id])
        })
        return res
    } catch (e) {
        console.log(e.toString(), e.stack)
    }
}

const endLongTermOperation = (options = {}) => new Promise((resolve, reject) => {
    try {

        let { section, test, interval, repeat } = options

        repeat = repeat || 5
        interval = interval || 1000

        let counter = 0

        let t = setInterval(() => {

            let task = selectTask(section, test)[0]

            console.log("WAIT FOR LONG-TERM", section, task)
            
            if (!task || task.status == "done" || counter > repeat) {
                clearInterval(t)
                resolve(true)
            }

            counter++

        }, interval)

    } catch (e) {
        console.log(e.toString(), e.stack)
    }

})


module.exports = {

    execute: task => {
        try {
            if (!queue) initiate()
            queue.enqueue(task)
        } catch (e) {
            console.log(e.toString(), e.stack)
        }
    },

    endLongTermOperation,

    pool: {
        startTask,
        stopTask,
        getTask,
        selectTask
    }
}