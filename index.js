module.exports = {

    init: async () => {
        const router = require('express').Router()
        const preloadedCache = require("./src/routes/preloaded-cache")
        const md5 = require("js-md5")


        const DBCache = await preloadedCache.init({
            users: {
                collection: "users",
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

        router.post("/get-grants/", [DBCache, App.getGrants])
        router.post("/get-forms/", [DBCache, App.getForms])
        router.post("/get-list/", [DBCache, App.getExaminationList])

        router.post("/update-forms/", [DBCache, App.updateForms])
        router.post("/sync-forms/", [DBCache, App.syncExaminations])
        router.post("/lock-forms/", [DBCache, App.lockForms])
        router.post("/unlock-forms/", [DBCache, App.unlockForms])

        router.post("/sync-assets/", [DBCache, App.syncAssets])

        router.post("/get-rules/", [DBCache, App.getRules])
        router.post("/submit/", [DBCache, App.postSubmitOneExamination])

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

        router.get("/i18n", [DBCache, I18n.getLocale])
        router.get("/i18n/md5", [DBCache, I18n.getLocaleMd5])

        /////////////////////////////////////////////////////////////////////////////////////
        return router
    }
}