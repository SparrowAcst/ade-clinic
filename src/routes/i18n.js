const { find } = require("lodash")

const getLocale = async (req, res) => {
    
    try {

        const { locale } = req.query
        const { i18n } = req.query.cache
        let result = find(i18n, d => d.name == locale) || find(i18n, d => d.name == "default")
        res.send(result)
     
    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}

const getLocaleMd5 = async (req, res) => {
    
    try {

        let { locale } = req.query 
        const { i18n } = req.query.cache
        let result = find(i18n, d => d.name == locale)
        if(!result) {
            locale = "default"
            result = find(i18n, d => d.name == locale)
        }    

        res.send({
            locale, 
            md5: result.md5
        })
     
    } catch (e) {
        res.send({
            error: e.toString(),
            requestBody: req.body
        })
    }
}


module.exports = {
    getLocale,
    getLocaleMd5
}