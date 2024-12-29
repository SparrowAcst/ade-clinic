const externalWorkflow = require("../utils/external-workflow")
const { sortBy, extend } = require("lodash")
const uuid = require("uuid").v4

const send = async (req, res) => {
    let message = extend({}, req.body,{requestId: uuid()}) 
    let publisher = await externalWorkflow.getPublisher("test")
    publisher.send(message)
    
    res.send({requestId: message.requestId})

}

const getMessages = async (req, res) => {
	
	let requestId = req.params.requestId
	console.log(requestId)
	let criteria = (requestId) ? ( d => d.data.requestId == requestId) : (() => true)
    console.log(criteria.toString())
    let messages =sortBy(externalWorkflow.getMessages(criteria), d => d.date)
    res.send(messages)
}

module.exports = {
    send,
    getMessages
}