const { updateAISegmentation } = require("./ai-segmentation")
const autoAccept = require("./auto-accept")

const syncOneExamination = require("../utils/sync-one-examination")
const {extend} = require("lodash")

const transferClinicData = async settings => {
    
    console.log(`LONG-TERM: transferClinicData: started`)
    let result = await syncOneExamination(settings)
    
    console.log(`LONG-TERM: transferClinicData: update ai segmentation`)
    await updateAISegmentation(extend( settings, result ))

	console.log(`LONG-TERM: transferClinicData: autoAccept`)
	await autoAccept(settings)
	
    console.log(`LONG-TERM: transferClinicData: done`)
}

module.exports = {
    transferClinicData
}