const { extend, isArray, first, last } = require("lodash")
const uuid = require("uuid").v4
const docdb = require("../utils/docdb")
const fs = require("fs")
const axios = require("axios")
const path = require("path")
const s3bucket = require("../utils/s3-bucket")
const filesize = require("file-size")
const { extension, lookup } = require("mime-types")
const AdmZip = require('adm-zip')
const detect = require('detect-file-type')

const DEST = "ADE-RECORDS"
const TEMP_DIR = path.resolve(__dirname, "../../../../temp")

const downloadFile = async (url, dest) => {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(dest, res.data);
} 

const decodeFileType = file => new Promise((resolve, reject) => {

    detect.fromFile(file, (err, result) => {
        if (err) {
            reject(err);
        } else {
            resolve(result)
        }
    })

})

const delay = miliseconds => new Promise( resolve => {
    setTimeout(() => { resolve()}, miliseconds)
})

const migrateFB2S3 = async ({ id, fbUrl }) => {

    console.log(`START: ${id}`)
    let message = `...${last(id.split("-"))} >  `

    if (!id || !fbUrl) {
        
        console.log(message+ "no data - err")
        
        return {
            error: "no data"
        }
    }

    try {
        
        let downloads = path.resolve(`${TEMP_DIR}/${id}`)
        let file = downloads
        
        await downloadFile(fbUrl, file)
        
        let type = await decodeFileType(file)
        console.log(type)
        
        if (type.ext == "zip") {
            
            const zip = AdmZip(file, {});
            const zipEntries = zip.getEntries();
            zip.extractAllTo(TEMP_DIR, true, true, '');
            const entry = path.resolve(`${TEMP_DIR}/${zipEntries[0].entryName}`);
            type = await decodeFileType(entry)
            file = path.resolve(`${TEMP_DIR}/${id}.${type.ext}`)
            await fs.promises.rename(entry, file);
        } else {

            newFile = path.resolve(`${TEMP_DIR}/${id}.${type.ext}`)
            await fs.promises.rename(file, newFile);
            file = newFile
            downloads = ""
        }


        await s3bucket.uploadLt20M({
            source: file,
            target: `${DEST}/${id}.${type.ext}`
        })

        // await fs.promises.chmod(downloads, 0o775)
        // await fs.promises.chmod(file, 0o775)
        
        if(downloads) {
            await fs.promises.unlink(downloads)
        }    
        
        await fs.promises.unlink(file)
        
        console.log(message + `S3: ${DEST}/${id}.${type.ext} - ok`)
            
        return {
            path: `${DEST}/${id}.${type.ext}`
        }

    } catch(e) {
        console.log(message + e.toString())
        return {
            error: e.toString()
        }
    }    
}

const migrateRecords = async settings => {

    let { records } = settings
   
    console.log(`LONG-TERM: Migrate Records: started`)

    for(let record of records){
        await migrateFB2S3({
            id: record.id,
            fbUrl: record.Source.url
        })
    }
     
    console.log(`LONG-TERM: Migrate Records: done`)
    
}

module.exports = migrateRecords