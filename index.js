module.exports = {

    init: async () => {
        const router = require('express').Router()
        const preloadedCache = require("./src/routes/preloaded-cache")
        const md5 = require("js-md5")


        const authorize = (req, res, next) => {
        
            if (req.isAuthenticated()) {
                return next()
            } else {
                res.status(401).send()
            }        

        }

        const DBCache = await preloadedCache.init({
            users: {
                collection: "users",
            },
            usersDev: {
                collection: "users-dev",
            },
            organizations: {
                collection: "organizations"
            },
            rules: {
                collection: "validation-rules"
            },
            i18n: {
                collection: "i18n",
                mapper: d => {
                    d.md5 = md5(JSON.stringify(d.v2l))
                    return d
                }
            }
        })

        ////////////////////////////////////////////////////////////////////////////

        router.get("/admin/cache-update/", DBCache)

        ////////////////////////////////////////////////////////////////////////////

        const App = require("./src/routes/app")

        router.post("/get-grants/", [authorize, DBCache, App.getGrants])
        router.post("/get-forms/", [authorize, DBCache, App.getForms])
        router.post("/get-list/", [authorize, DBCache, App.getExaminationList])

        router.post("/update-forms/", [authorize, DBCache, App.updateForms])
        router.post("/sync-forms/", [authorize, DBCache, App.syncExaminations])
        router.post("/lock-forms/", [authorize, DBCache, App.lockForms])
        router.post("/unlock-forms/", [authorize, DBCache, App.unlockForms])

        router.post("/sync-assets/", [authorize, DBCache, App.syncAssets])

        router.post("/get-rules/", [authorize, DBCache, App.getRules])
        router.post("/submit/", [authorize, DBCache, App.postSubmitOneExamination])

        /////////////////////////////////////////////////////////////////////////////////

        const Uploader = require("./src/routes/files")

        router.get("/file/fileid", Uploader.getFileId)
        router.get("/file/upload", Uploader.getUpload)
        router.post("/file/upload", Uploader.postUpload)
        router.post("/file/s3", Uploader.s3Upload)
        router.get("/file/s3/status", Uploader.s3UploadStatus)
        router.post("/file/s3/status", Uploader.s3UploadStatus)
        router.post("/file/s3/metadata", Uploader.s3Metadata)
        router.post("/file/s3/url", Uploader.s3PresignedUrl)

        /////////////////////////////////////////////////////////////////////////////////////

        const I18n = require("./src/routes/i18n")

        router.get("/i18n", [authorize, DBCache, I18n.getLocale])
        router.get("/i18n/md5", [authorize, DBCache, I18n.getLocaleMd5])

        /////////////////////////////////////////////////////////////////////////////////////

        const test = require("./src/routes/test")
        const externalWorkflow = require("./src/utils/external-workflow")
        
        const consumer = await externalWorkflow.getConsumer("submitExaminationReport")
        
        consumer.on("message", message => {
            console.log("MS MESSAGE: ", message)
        })

        // router.get("/test/messages", test.getMessages)
        // router.get("/test/messages/:requestId", test.getMessages)
        // router.post("/test/send", test.send)
     
        /////////////////////////////////////////////////////////////////////////////////////
        return router
    }
}