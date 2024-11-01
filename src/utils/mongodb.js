const mongo = require('mongodb').MongoClient

let clients = 0


const normalize = str => {
	const d = str.split(".")
	return {
		dbName: d[0],
		collectionName: d[1]
	}
}	


const drop = async options => {
	let client
	clients++
	try {
		
		const conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
		await client
				.db(conf.dbName)
				.collection(conf.collectionName)
				.drop()
	
	} catch (e) {

		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
		clients--
	}    
} 

const listCollections = async options => {
	let client
	clients++
	try {
		
		const conf = normalize(options.db.name)
		
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
		
		const res =  await client
	    				.db(conf.dbName)
	    				.listCollections()
	    				.toArray()
		return res

	} catch (e) {
		
		console.log(e.toString())
		throw new Error(e)
	
	} finally {
	
		if(client) client.close()
		clients--	
	
	}

}



const aggregate = async options => {
	clients++
	// console.log(">>>> A", clients)
	// console.log("options", JSON.stringify(options, null, " "))
		
	options.retry = (options.retry || 0) + 1
	
	let client
	
	try {

		const conf = normalize(options.collection)
		const pipeline = options.pipeline || []
	    
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
		
		const res =  await client
	    				.db(conf.dbName)
	    				.collection(conf.collectionName)
	    				.aggregate(pipeline.concat([{$project:{_id:0}}]))
			   			.toArray()
		return res

	} catch (e) {
		
		console.log(e.toString(), e.stack)
		console.log("> db client count:", clients)
			
		if(client) {
			console.log(">> close client")
			
			client.close()
			clients--
		}	

		console.log(">>> db client count:", clients)
		
		if(options.retry == 1){
			console.log(`Retry aggregate operation`)
			const res = await aggregate(options)	
			return res
		} else {
			throw new Error(e)	
		}
	
	} finally {
	
		if(client) client.close()
		clients--
		// console.log("<<<<<< A")
	}   
}

const aggregate_raw = async options => {
	let client
	try {
		
		const conf = normalize(options.collection)
		const pipeline = options.pipeline || []
	    
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
		
		const res =  await client
	    				.db(conf.dbName)
	    				.collection(conf.collectionName)
	    				.aggregate(pipeline)
			   			.toArray()
		return res

	} catch (e) {
		
		console.log(e.toString())
		throw new Error(e+JSON.stringify(options, null, " "))
	
	} finally {
	
		if(client) client.close()
	
	}   
}

const removeAll = async options => {
	let client

	try {
		
		const conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
		await client
				.db(conf.dbName)
				.collection(conf.collectionName)
				.deleteMany({})
	
	} catch (e) {

		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
	
	}    
}


const deleteMany = async options => {
	let client

	try {
		
		const conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
		await client
				.db(conf.dbName)
				.collection(conf.collectionName)
				.deleteMany(options.filter)
	
	} catch (e) {
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
	
	}    
} 

const insertAll = async options => {
	let client
	try {

		let conf = normalize(options.collection)
		
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
		
		await client
				.db(conf.dbName)
				.collection(conf.collectionName)
				.insertMany(options.data)
	
	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
	
	}	
}

const bulkWrite = async options => {
	let client
	clients++
	// console.log(">>>> B", clients)
	try {
		
		const conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})

		await client
				.db(conf.dbName)
				.collection(conf.collectionName)
				.bulkWrite(options.commands)

	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
		clients--	
	
	}	
}

const replaceOne = async options => {
	let client
	clients++
	// console.log(">>>> RO", clients)
	
	try {

		const conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})

	    await client
	    		.db(conf.dbName)
	    		.collection(conf.collectionName)
	    		.replaceOne(options.filter, options.data, {upsert: true})

	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
		clients--
	}    
}

const updateOne = async options => {
	let client
	clients++
	// console.log(">>>> UO", clients)
	
	try {
	
		let conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
	    await client
	    		.db(conf.dbName)
	    		.collection(conf.collectionName)
	    		.updateOne(options.filter, { $set:options.data }, { upsert: true })
	
	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
		clients--
	}    
}

const deleteOne = async options => {
	let client
	try {
	
		let conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
	    await client
	    		.db(conf.dbName)
	    		.collection(conf.collectionName)
	    		.deleteOne(options.filter)
	
	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
	
	}    
}


const updateMany = async options => {
	let client
	try {
	
		let conf = normalize(options.collection)
		client = await mongo.connect(options.db.url, {
		    useNewUrlParser: true,
		    useUnifiedTopology: true
		})
	
	    await client
	    		.db(conf.dbName)
	    		.collection(conf.collectionName)
	    		.updateMany(options.filter, { $set:options.data }, { upsert: true })
	
	} catch (e) {
	
		console.log(e.toString())
		throw new Error(e)

	} finally {
	
		if(client) client.close()
	
	}    
}



module.exports =  {
	aggregate,
	removeAll,
	insertAll,
	replaceOne,
	updateOne,
	deleteOne,
	bulkWrite,
	listCollections, 
	drop,
	aggregate_raw,
	deleteMany,
	updateMany	
}