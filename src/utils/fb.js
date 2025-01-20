const { initializeApp, cert } = require('firebase-admin/app')
const { getStorage } = require('firebase-admin/storage')
const { getFirestore } = require('firebase-admin/firestore')
const uuid = require("uuid").v4
const { find, uniqBy } = require("lodash")

const serviceAccount = require("../../.config/ade-clinic").fb

const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: `gs://${serviceAccount.project_id}.appspot.com`
})

const bucket = getStorage(app).bucket()
const FB_DB = getFirestore(app);

let logger

// let collections = []


const selectData = async (collectionName, selector) => {

    try {
        // const isGroup = collections.includes(collectionName)
        selector = selector || []

        // if (collections.includes(collectionName.split("/")[0])) {
        let query = FB_DB.collection(collectionName)
        selector.forEach(s => {
            if (s && s.length == 3) query = query.where(...s)
        })

        const querySnapshot = await query.get();
        return querySnapshot.docs
            .map((doc) => ({
                id: doc.id,
                ...doc.data()
            }))
    } catch (e) {
        console.log(e.toString())
        throw e
    }
}


const getCollectionItems = async (collectionName, selector) => {

    try {
        // const isGroup = collections.includes(collectionName)
        selector = selector || []

        // if (collections.includes(collectionName.split("/")[0])) {
        let query = FB_DB.collection(collectionName)
        selector.forEach(s => {
            if (s && s.length == 3) query = query.where(...s)
        })

        const querySnapshot = await query.get();
        return querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }))
        // } else {
        // console.log("selector", selector, collectionName)
        // let query = FB_DB.collectionGroup(collectionName)

        // selector.forEach(s => {
        //     if (s && s.length == 3) query = query.where(...s)
        // })
        // console.log("query", query)
        // const querySnapshot = await query.get();

        // console.log("querySnapshot", querySnapshot)

        // return querySnapshot.docs.map(doc => ({
        //     id: doc.id,
        //     path: doc._ref._path.segments,
        //     ...doc.data()
        // }))
        // }
    } catch (e) {
        console.log(e.toString())
        throw e
    }
}

const uploadFile = async (filepath, filename) => {

    try {

        let res = await bucket.upload(filepath, {
            gzip: true,
            destination: filename,
            metadata: {
                contentType: 'audio/x-wav'
            }
        })

        res = await res[0].getSignedUrl({
            action: 'read',
            expires: new Date().setFullYear(new Date().getFullYear() + 2)
        })

        return res

    } catch (e) {
        console.log('Retry');
        return uploadFile(filepath, filename);
    }

}


const getSignedUrl = async filename => {

    const file = bucket.file(filename)
    let res = await file.getSignedUrl({
        action: 'read',
        expires: new Date().setFullYear(new Date().getFullYear() + 2)
    })
    return res[0]

}

const saveFileFromStream = (filename, file, stream) => {
    return new Promise((resolve, reject) => {
        stream
            .pipe(bucket.file(filename).createWriteStream({
                gzip: true,
                metadata: {
                    contentType: file.mimeType
                }
            }))
            .on('finish', async () => {

                let res = await bucket.file(filename).getSignedUrl({
                    action: 'read',
                    expires: new Date().setFullYear(new Date().getFullYear() + 2)
                })

                resolve(res)
            })
            .on('error', err => {
                reject(err)
            })

    })
}


const saveFile = async (filename, data) => {
    try {


        let res = await bucket.file(filename).save(data, {
            gzip: true,
            metadata: {
                contentType: 'audio/x-wav'
            }
        })

        res = await bucket.file(filename).getSignedUrl({
            action: 'read',
            expires: new Date().setFullYear(new Date().getFullYear() + 2)
        })

        return res

    } catch (e) {
        console.log(e.toString())
        console.log('Retry');
        return saveFile(filename, data);
    }

}


const downloadFile = async (srcFilename, destFilename) => {

    const options = {
        destination: destFilename,
    };

    try {
        await bucket.file(srcFilename).download(options);
    } catch (e) {
        console.log(e.toString())
    }

}

const fetchFileData = async srcFileName => {
    const contents = await bucket.file(srcFileName).download();
    return contents
}



const getFileMetadata = async filename => {
    let res = []
    try {
        res = await bucket.file(filename).getMetadata()
    } catch (e) {
        console.log(e.toString())
    } finally {
        return res[0]
    }

}


const getFbAssets = async examinationId => {

    const docMapper = doc => ({
        id: doc.id,
        ...doc.data()
    })

    let exams = FB_DB.collection('examinations')
    const docRef = exams.doc(examinationId)
    let assets = (await docRef.collection('assets').get()).docs.map(docMapper)
    let recordPoints = (await docRef.collection('recordPoints').get()).docs.map(docMapper)
    let records = (await docRef.collection('records').get()).docs.map(docMapper)

    for (let i = 0; i < assets.length; i++) {
        if (assets[i].links) {
            assets[i].metadata = await getFileMetadata(assets[i].links.path)
            assets[i].links.valid = !!assets[i].metadata
        } else {
            assets[i].metadata = {}
            assets[i].links = { valid: false }
        }
    }

    let recordings = assets
        .filter(a => a.type == "recording")
        .map(a => {

            let record = find(records, r => r.id == a.parentId)
            let recordPoint

            if (record) {
                recordPoint = find(recordPoints, r => r.id == record.parentId)
            }

            return {
                id: a.id,
                valid: a.links.valid,
                device: a.device,
                deviceDescription: a.deviceDescription || "",
                Source: {
                    path: (a.links) ? a.links.path : undefined,
                    url: (a.links) ? a.links.url : undefined,
                },
                bodyPosition: (record) ? record.bodyPosition : "",
                spot: (recordPoint) ? recordPoint.spot : "",
                type: (recordPoint) ? recordPoint.type : "",

            }

        })

    let files = assets
        .filter(a => a.type != "recording")
        .filter(a => a.links)
        .filter(a => a.metadata)

        .map((a, index) => ({
            id: a.id,
            path: a.path,
            publicName: a.publicName,
            name: a.publicName || `${a.type}-${index}.${(a.metadata.contentType || "").split("/")[1]}`,
            mimeType: a.mimeType || a.metadata.contentType,
            size: a.metadata.size,
            updatedAt: a.metadata.updated,
            url: a.links.url,
            valid: a.links.valid
        }))

    return {
        recordings,
        files
    }

}

const getFbAssets1 = async patientId => {

    const docMapper = doc => ({
        id: doc.id,
        ...doc.data()
    })

    let docs = await selectData("examinations", [
        ["patientId", "==", patientId]
    ])
    let assets = []
    let recordPoints = []
    let records = []
    for (const doc of docs) {
        console.log("-------------------------> DOC", doc.id)
        const docRef = FB_DB.collection('examinations').doc(doc.id)

        assets = assets.concat((await docRef.collection('assets').get()).docs.map(docMapper))
        recordPoints = recordPoints.concat((await docRef.collection('recordPoints').get()).docs.map(docMapper))
        records = records.concat((await docRef.collection('records').get()).docs.map(docMapper))
    }

    console.log("ASSETS", assets)


    assets = uniqBy(assets.filter(d => d.links), d => d.links.path)

    for (let i = 0; i < assets.length; i++) {
        if (assets[i].links) {
            assets[i].metadata = await getFileMetadata(assets[i].links.path)
            assets[i].links.valid = !!assets[i].metadata
        } else {
            assets[i].metadata = {}
            assets[i].links = { valid: false }
        }
    }

    let recordings = assets
        .filter(a => a.type == "recording")
        .map(a => {

            let record = find(records, r => r.id == a.parentId)
            let recordPoint

            if (record) {
                recordPoint = find(recordPoints, r => r.id == record.parentId)
            }

            return {
                id: a.id,
                valid: a.links.valid,
                device: a.device,
                deviceDescription: a.deviceDescription || "",
                Source: {
                    path: (a.links) ? a.links.path : undefined,
                    url: (a.links) ? a.links.url : undefined,
                },
                date: a.timestamp,
                bodyPosition: (record) ? record.bodyPosition : "",
                spot: (recordPoint) ? recordPoint.spot : "",
                type: (recordPoint) ? recordPoint.type : "",

            }

        })

    let files = assets
        .filter(a => a.type != "recording")
        .filter(a => a.links)
        .filter(a => a.metadata)

        .map((a, index) => ({
            id: a.id,
            path: a.path,
            publicName: a.publicName,
            name: a.publicName || `${a.type}-${index}.${(a.metadata.contentType || "").split("/")[1]}`,
            mimeType: a.mimeType || a.metadata.contentType,
            size: a.metadata.size,
            updatedAt: a.metadata.updated,
            url: a.links.url,
            valid: a.links.valid
        }))

    return {
        recordings,
        files
    }

}


const getOrganization = async id => {

    const docMapper = doc => ({
        id: doc.id,
        ...doc.data()
    })

    return docMapper((await FB_DB.collection('organizations').doc(id).get()))
}


const expandExaminations = async (...examinations) => {

    const docMapper = doc => ({
        id: doc.id,
        ...doc.data()
    })

    examinations = examinations || []

    for (let examination of examinations) {

        try {

            const docRef = FB_DB.collection('examinations').doc(examination.id)

            examination.$extention = {

                forms: (await docRef.collection('forms').get()).docs.map(docMapper),
                recordPoints: (await docRef.collection('recordPoints').get()).docs.map(docMapper),
                records: (await docRef.collection('records').get()).docs.map(docMapper),
                assets: (await docRef.collection('assets').get()).docs.map(docMapper).filter(a => !!a.links)

            }

        } catch (e) {

            console.log("expandExaminations", e.toString(), e.stack)
            throw (e)

        }
    }

    return examinations

}





module.exports = {
    db: FB_DB,
    getCollectionItems,
    getFbAssets,
    getFbAssets1,
    getSignedUrl,
    expandExaminations,
    getOrganization
}


// async () => {
//     collections = await db.listCollections()
//     collections = collections.map(d => d.id)

//     logger = logger || console

//     return {
//         db,
//         bucket,
//         execute: {
//             getCollectionItems,
//             uploadFile,
//             downloadFile,
//             fetchFileData,
//             saveFile,
//             saveFileFromStream,
//             getFileMetadata
//         }
//     }

// }