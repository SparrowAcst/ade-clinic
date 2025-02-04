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

        const { RELOAD, PRELOAD, WRITEBACK, LIST } = await preloadedCache.init({
            
            users: {
                collection: "users",
                writeback: {
                    identity: "name"
                }
            },

            usersDev: {
                collection: "users-dev",
            },

            organizations: {
                collection: "organizations",
                writeback: {
                    identity: "id"
                }
            },

            rules: {
                collection: "validation-rules",
                writeback: {
                    identity: "name"
                }
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

        router.get("/admin/cache/reload/", [RELOAD])
        router.post("/admin/cache/update/", [authorize, WRITEBACK])
        router.post("/admin/cache/:entity", [authorize, WRITEBACK])
        router.get("/admin/cache/:entity", [authorize, LIST])
                

        ////////////////////////////////////////////////////////////////////////////

        const App = require("./src/routes/app")

        router.post("/get-grants/", [authorize, PRELOAD, App.getGrants])
        router.post("/get-forms/", [authorize, PRELOAD, App.getForms])
        router.post("/get-list/", [authorize, PRELOAD, App.getExaminationList])

        router.post("/update-forms/", [authorize, PRELOAD, App.updateForms])
        router.post("/sync-forms/", [authorize, PRELOAD, App.syncExaminations])
        router.post("/lock-forms/", [authorize, PRELOAD, App.lockForms])
        router.post("/unlock-forms/", [authorize, PRELOAD, App.unlockForms])

        router.post("/sync-assets/", [authorize, PRELOAD, App.syncAssets])

        router.post("/get-rules/", [authorize, PRELOAD, App.getRules])
        router.post("/submit/", [authorize, PRELOAD, App.postSubmitOneExamination])

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

        router.get("/i18n", [authorize, PRELOAD, I18n.getLocale])
        router.get("/i18n/md5", [authorize, PRELOAD, I18n.getLocaleMd5])

        /////////////////////////////////////////////////////////////////////////////////////

        const test = require("./src/routes/test")
        const externalWorkflow = require("./src/utils/external-workflow")
        
        const consumer = await externalWorkflow.getConsumer("submitExaminationReport")
        
        consumer.on("message", message => {
            console.log("MS MESSAGE: ", JSON.parse(message.toString()))
        })

        consumer.on("error", error => {
            console.log("MS ERROR: ", error.toString())
        })

        
        /////////////////////////////////////////////////////////////////////////////////////
        
        const adeClinicDataManagement = require("./src/routes/clinic-data-management")
        router.post("/cdm/get-exams/", [authorize, PRELOAD, adeClinicDataManagement.getExams])
        router.post("/cdm/get-state-chart/", [authorize, PRELOAD, adeClinicDataManagement.getStateChart])
        router.post("/cdm/accept-examinations/", [authorize, PRELOAD, adeClinicDataManagement.acceptExaminations])
        router.post("/cdm/reject-examinations/", [authorize, PRELOAD, adeClinicDataManagement.rejectExaminations])

        //////////////////////////////////////////////////////////////////////////////////////


        const segmentationRequest = require("./src/routes/segmentation-request")

        // router.post("/open-request", [authorize, PRELOAD, segmentationRequest.openRequest])
        router.post("/open-request", [segmentationRequest.openRequest])

        router.get("/segmentation/", segmentationRequest.getRequest)
        router.get("/segmentation/:requestId", segmentationRequest.getRequest)
        router.post("/segmentation/", segmentationRequest.saveRequest)
        router.post("/segmentation/:requestId", segmentationRequest.saveRequest)

        ///////////////////////////////////////////////////////////////////////////////////////

        return router
    }
}