// Định nghĩa lớp Env
class Env {
    constructor(name, opts) {
        this.name = name
        this.http = new this.Http(this)
        this.data = null
        this.dataFile = 'box.dat'
        this.logs = []
        this.isMute = false
        this.isNeedRewrite = false
        this.logSeparator = '\n'
        this.startTime = new Date().getTime()
        Object.assign(this, opts)
        this.log('', `🔔${this.name}, 开始!`)
    }

    isNode() {
        return 'undefined' !== typeof module && !!module.exports
    }

    isQuanX() {
        return 'undefined' !== typeof $task
    }

    isSurge() {
        return 'undefined' !== typeof $httpClient && 'undefined' === typeof $loon
    }

    isLoon() {
        return 'undefined' !== typeof $loon
    }

    toObj(str, defaultValue = null) {
        try {
            return JSON.parse(str)
        } catch {
            return defaultValue
        }
    }

    toStr(obj, defaultValue = null) {
        try {
            return JSON.stringify(obj)
        } catch {
            return defaultValue
        }
    }

    getjson(key, defaultValue) {
        let json = defaultValue
        const val = this.getdata(key)
        if (val) {
            try {
                json = JSON.parse(this.getdata(key))
            } catch {}
        }
        return json
    }

    setjson(val, key) {
        try {
            return this.setdata(JSON.stringify(val), key)
        } catch {
            return false
        }
    }

    getScript(url) {
        return new Promise((resolve) => {
            this.get({ url }, (err, resp, body) => resolve(body))
        })
    }

    runScript(script, runOpts) {
        return new Promise((resolve) => {
            let httpapi = this.getdata('@chavy_boxjs_userCfgs.httpapi')
            httpapi = httpapi ? httpapi.replace(/\n/g, '').trim() : httpapi
            let httpapi_timeout = this.getdata('@chavy_boxjs_userCfgs.httpapi_timeout')
            httpapi_timeout = httpapi_timeout ? httpapi_timeout * 1 : 20
            httpapi_timeout = runOpts && runOpts.timeout ? runOpts.timeout : httpapi_timeout
            const [key, addr] = httpapi.split('@')
            const opts = {
                url: `http://${addr}/v1/scripting/evaluate`,
                body: { script_text: script, mock_type: 'cron', timeout: httpapi_timeout },
                headers: { 'X-Key': key, Accept: '*/*' },
            }
            this.post(opts, (err, resp, body) => resolve(body))
        }).catch((e) => this.logErr(e))
    }

    loaddata() {
        if (this.isNode()) {
            const fs = require('fs')
            const path = require('path')
            const curDirDataFilePath = path.resolve(this.dataFile)
            const rootDirDataFilePath = path.resolve(process.cwd(), this.dataFile)
            const isCurDirDataFile = fs.existsSync(curDirDataFilePath)
            const isRootDirDataFile = !isCurDirDataFile && fs.existsSync(rootDirDataFilePath)
            if (isCurDirDataFile || isRootDirDataFile) {
                const datPath = isCurDirDataFile ? curDirDataFilePath : rootDirDataFilePath
                try {
                    return JSON.parse(fs.readFileSync(datPath))
                } catch (e) {
                    return {}
                }
            } else return {}
        } else return {}
    }

    writedata() {
        if (this.isNode()) {
            const fs = require('fs')
            const path = require('path')
            const curDirDataFilePath = path.resolve(this.dataFile)
            const rootDirDataFilePath = path.resolve(process.cwd(), this.dataFile)
            const isCurDirDataFile = fs.existsSync(curDirDataFilePath)
            const isRootDirDataFile = !isCurDirDataFile && fs.existsSync(rootDirDataFilePath)
            const jsondata = JSON.stringify(this.data)
            if (isCurDirDataFile) {
                fs.writeFileSync(curDirDataFilePath, jsondata)
            } else if (isRootDirDataFile) {
                fs.writeFileSync(rootDirDataFilePath, jsondata)
            } else {
                fs.writeFileSync(curDirDataFilePath, jsondata)
            }
        }
    }

    getdata(key) {
        let val = this.getval(key)
        if (/^@/.test(key)) {
            const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key)
            const objval = objkey ? this.getval(objkey) : ''
            if (objval) {
                try {
                    const objedval = JSON.parse(objval)
                    val = objedval ? this.lodash_get(objedval, paths, '') : val
                } catch (e) {
                    val = ''
                }
            }
        }
        return val
    }

    setdata(val, key) {
        let issuc = false
        if (/^@/.test(key)) {
            const [, objkey, paths] = /^@(.*?)\.(.*?)$/.exec(key)
            const objdat = this.getval(objkey)
            const objval = objkey ? (objdat === 'null' ? null : objdat || '{}') : '{}'
            try {
                const objedval = JSON.parse(objval)
                this.lodash_set(objedval, paths, val)
                issuc = this.setval(JSON.stringify(objedval), objkey)
            } catch (e) {
                const objedval = {}
                this.lodash_set(objedval, paths, val)
                issuc = this.setval(JSON.stringify(objedval), objkey)
            }
        } else {
            issuc = this.setval(val, key)
        }
        return issuc
    }

    getval(key) {
        if (this.isSurge() || this.isLoon()) {
            return $persistentStore.read(key)
        } else if (this.isQuanX()) {
            return $prefs.valueForKey(key)
        } else if (this.isNode()) {
            this.data = this.loaddata()
            return this.data[key]
        } else {
            return this.data && this.data[key] || null
        }
    }

    setval(val, key) {
        if (this.isSurge() || this.isLoon()) {
            return $persistentStore.write(val, key)
        } else if (this.isQuanX()) {
            return $prefs.setValueForKey(val, key)
        } else if (this.isNode()) {
            this.data = this.loaddata()
            this.data[key] = val
            this.writedata()
            return true
        } else {
            return this.data && this.data[key] || null
        }
    }

    initGotEnv(opts) {
        this.got = this.got ? this.got : require('got')
        this.cktough = this.cktough ? this.cktough : require('tough-cookie')
        this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar()
        if (opts) {
            opts.headers = opts.headers ? opts.headers : {}
            if (undefined === opts.headers.Cookie && undefined === opts.cookieJar) {
                opts.cookieJar = this.ckjar
            }
        }
    }

    get(opts, callback = () => {}) {
        if (opts.headers) {
            delete opts.headers['Content-Type']
            delete opts.headers['Content-Length']
        }
        if (this.isSurge() || this.isLoon()) {
            if (this.isSurge() && this.isNeedRewrite) {
                opts.headers = opts.headers || {}
                Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false })
            }
            $httpClient.get(opts, (err, resp, body) => {
                if (!err && resp) {
                    resp.body = body
                    resp.statusCode = resp.status ? resp.status : resp.statusCode
                    resp.status = resp.statusCode
                }
                callback(err, resp, body)
            })
        } else if (this.isQuanX()) {
            if (this.isNeedRewrite) {
                opts.opts = opts.opts || {}
                Object.assign(opts.opts, { hints: false })
            }
            $task.fetch(opts).then(
                (resp) => {
                    const { statusCode: status, statusCode: statusCode, headers: headers, body: body } = resp
                    callback(null, { status, statusCode, headers, body }, body)
                },
                (err) => callback(err)
            )
        } else if (this.isNode()) {
            this.initGotEnv(opts)
            this.got(opts)
                .on('redirect', (resp, nextOpts) => {
                    try {
                        if (resp.headers['set-cookie']) {
                            const ck = resp.headers['set-cookie']
                                .map(this.cktough.Cookie.parse)
                                .toString()
                            ck && this.ckjar.setCookieSync(ck, null)
                            nextOpts.cookieJar = this.ckjar
                        }
                    } catch (e) {
                        this.logErr(e)
                    }
                })
                .then(
                    (resp) => {
                        const { statusCode: status, statusCode: statusCode, headers: headers, body: body } = resp
                        callback(null, { status, statusCode, headers, body }, body)
                    },
                    (err) => {
                        const { message: error, response: resp } = err
                        callback(error, resp, resp && resp.body)
                    }
                )
        }
    }

    post(opts, callback = () => {}) {
        const method = opts.method ? opts.method.toLocaleLowerCase() : 'post'
        if (opts.body && opts.headers && !opts.headers['Content-Type'] && !opts.headers['content-type']) {
            opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
        }
        if (opts.headers) delete opts.headers['Content-Length']
        if (this.isSurge() || this.isLoon()) {
            if (this.isSurge() && this.isNeedRewrite) {
                opts.headers = opts.headers || {}
                Object.assign(opts.headers, { 'X-Surge-Skip-Scripting': false })
            }
            $httpClient[method](opts, (err, resp, body) => {
                if (!err && resp) {
                    resp.body = body
                    resp.statusCode = resp.status ? resp.status : resp.statusCode
                    resp.status = resp.statusCode
                }
                callback(err, resp, body)
            })
        } else if (this.isQuanX()) {
            opts.method = method
            if (this.isNeedRewrite) {
                opts.opts = opts.opts || {}
                Object.assign(opts.opts, { hints: false })
            }
            $task.fetch(opts).then(
                (resp) => {
                    const { statusCode: status, statusCode: statusCode, headers: headers, body: body } = resp
                    callback(null, { status, statusCode, headers, body }, body)
                },
                (err) => callback(err)
            )
        } else if (this.isNode()) {
            this.initGotEnv(opts)
            const { url, ..._opts } = opts
            this.got[method](url, _opts).then(
                (resp) => {
                    const { statusCode: status, statusCode: statusCode, headers: headers, body: body } = resp
                    callback(null, { status, statusCode, headers, body }, body)
                },
                (err) => {
                    const { message: error, response: resp } = err
                    callback(error, resp, resp && resp.body)
                }
            )
        }
    }

    time(fmt, ts = null) {
        const date = ts ? new Date(ts) : new Date()
        let o = {
            'M+': date.getMonth() + 1,
            'd+': date.getDate(),
            'H+': date.getHours(),
            'm+': date.getMinutes(),
            's+': date.getSeconds(),
            'q+': Math.floor((date.getMonth() + 3) / 3),
            S: date.getMilliseconds(),
        }
        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + '').substr(4 - RegExp.$1.length))
        for (let k in o)
            if (new RegExp('(' + k + ')').test(fmt))
                fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length))
        return fmt
    }

    msg(title = name, subt = '', desc = '', opts) {
        const toEnvOpts = (rawopts) => {
            if (!rawopts) return rawopts
            if (typeof rawopts === 'string') {
                if (this.isLoon()) return rawopts
                else if (this.isQuanX()) return { 'open-url': rawopts }
                else if (this.isSurge()) return { url: rawopts }
                else return undefined
            } else if (typeof rawopts === 'object') {
                if (this.isLoon()) {
                    let openUrl = rawopts.openUrl || rawopts.url || rawopts['open-url']
                    let mediaUrl = rawopts.mediaUrl || rawopts['media-url']
                    return { openUrl, mediaUrl }
                } else if (this.isQuanX()) {
                    let openUrl = rawopts['open-url'] || rawopts.url || rawopts.openUrl
                    let mediaUrl = rawopts['media-url'] || rawopts.mediaUrl
                    let updatePasteboard = rawopts['update-pasteboard'] || rawopts.updatePasteboard
                    return { 'open-url': openUrl, 'media-url': mediaUrl, 'update-pasteboard': updatePasteboard }
                } else if (this.isSurge()) {
                    let openUrl = rawopts.url || rawopts.openUrl || rawopts['open-url']
                    return { url: openUrl }
                }
            } else {
                return undefined
            }
        }
        if (!this.isMute) {
            if (this.isSurge() || this.isLoon()) {
                $notification.post(title, subt, desc, toEnvOpts(opts))
            } else if (this.isQuanX()) {
                $notify(title, subt, desc, toEnvOpts(opts))
            }
        }
        let logs = ['', '==============📣系统通知📣==============']
        logs.push(title)
        subt ? logs.push(subt) : ''
        desc ? logs.push(desc) : ''
        console.log(logs.join('\n'))
        this.logs = this.logs.concat(logs)
    }

    log(...logs) {
        if (logs.length > 0) {
            this.logs = [...this.logs, ...logs]
        }
        console.log(logs.join(this.logSeparator))
    }

    logErr(err, msg) {
        const isPrintStack = !this.isSurge() && !this.isQuanX() && !this.isLoon()
        if (!isPrintStack) {
            this.log('', `❗️${this.name}, 错误!`, err)
        } else {
            this.log('', `❗️${this.name}, 错误!`, err.stack)
        }
    }

    wait(time) {
        return new Promise((resolve) => setTimeout(resolve, time))
    }

    done(val = {}) {
        const endTime = new Date().getTime()
        const costTime = (endTime - this.startTime) / 1000
        this.log('', `🔔${this.name}, 结束! 🕛 ${costTime} 秒`)
        this.log()
        if (this.isSurge() || this.isQuanX() || this.isLoon()) {
            $done(val)
        }
    }
}

// Script chính
const $ = new Env('𝐓𝐞𝐬𝐭𝐅𝐥𝐢𝐠𝐡𝐭自动加入')
$.isRequest = () => 'undefined' != typeof $request
const [
    HeadersStr,
    APP_ID_Str,
    LOON_COUNT = 1,
    INTERVAL = 0
] = ['tf_headers', 'tf_app_ids', 'tf_loon_count', 'tf_interval'].map((key) => $.getdata(key))
var APP_IDS = APP_ID_Str ? APP_ID_Str.split(',') : []
var HeadersList = HeadersStr ? JSON.parse(HeadersStr) : []

const inArray = (value, array = APP_IDS, separator = '#') => array.findIndex((item) => item.split(separator)[0] === value)

// Lưu thời gian kiểm tra cuối cùng
const LAST_CHECK_TIMES = $.getdata('tf_last_check_times') ? JSON.parse($.getdata('tf_last_check_times')) : {}
const LAST_HEADER_USE = $.getdata('tf_last_header_use') ? JSON.parse($.getdata('tf_last_header_use')) : {}

const getParams = () => {
    const { url, headers: header } = $request
    const handler = (appId) => {
        const status = '0' // 0: 未加入| 1: 已加入
        const CACHE_APP_ID = `${appId}#${status}`
        if (!APP_IDS.includes(CACHE_APP_ID)) {
            APP_IDS.push(CACHE_APP_ID)
            $.setdata(APP_IDS.join(','), 'tf_app_ids')
            $.msg($.name, 'Lấy tham số ứng dụng thành công', `Đã bắt và lưu ID ứng dụng: ${appId}`)
        } else {
            $.msg($.name, '', `ID ứng dụng: ${appId} đã tồn tại, không cần thêm lại.`)
        }
    }
    if (/^https:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps$/.test(url)) {
        const headers = Object.fromEntries(Object.entries(header).map(([key, value]) => [key.toLowerCase(), value]))
        const session_id = headers['x-session-id']
        const session_digest = headers['x-session-digest']
        const request_id = headers['x-request-id']
        const key = /\/accounts\/(.*?)\/apps/.exec(url)?.[1] || null

        // Lấy app_id từ URL nếu có
        const appIdMatch = url.match(/\/accounts\/(.*?)\/apps/)
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1]
            handler(appId)
        }

        HeadersList.push({ 'X-Session-Id': session_id, 'X-Session-Digest': session_digest, 'X-Request-Id': request_id })
        LAST_HEADER_USE[HeadersList.length - 1] = Date.now() - (6 * 60 * 1000) // Đặt thời gian sử dụng cuối cùng của header mới
        $.setdata(JSON.stringify(HeadersList), 'tf_headers')
        $.setdata(JSON.stringify(LAST_HEADER_USE), 'tf_last_header_use')
        $.setdata(key, 'tf_key')
        const encrypt = (str) => str.slice(0, 4) + '***********'
        $.msg($.name, 'Lấy tham số TF thành công', `𝐬𝐞𝐬𝐬𝐢𝐨𝐧_𝐢𝐝: ${session_id}\n𝐬𝐞𝐬𝐬𝐢𝐨𝐧_𝐝𝐢𝐠𝐞𝐬𝐭: ${session_digest}\n𝐫𝐞𝐪𝐮𝐞𝐬𝐭_𝐢𝐝: ${request_id}\n𝐤𝐞𝐲: ${key}`)
    } else if (/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/.test(url)) {
        const headers = Object.fromEntries(Object.entries(header).map(([key, value]) => [key.toLowerCase(), value]))
        const session_id = headers['x-session-id']
        const session_digest = headers['x-session-digest']
        const request_id = headers['x-request-id']
        const key = /\/join\/(.*?)$/.exec(url)?.[1] || null
        HeadersList.push({ 'X-Session-Id': session_id, 'X-Session-Digest': session_digest, 'X-Request-Id': request_id })
        LAST_HEADER_USE[HeadersList.length - 1] = Date.now() - (6 * 60 * 1000) // Đặt thời gian sử dụng cuối cùng của header mới
        $.setdata(JSON.stringify(HeadersList), 'tf_headers')
        $.setdata(JSON.stringify(LAST_HEADER_USE), 'tf_last_header_use')
        handler(key)
    } else if (/v3\/accounts\/.*\/ru/.test(url)) {
        const reg = /v3\/accounts\/.*\/ru\/(.*[^\/accept])/
        const appId = reg.exec(url)[1]
        handler(appId)
    }
}

const TF_Join = (app_id, headers) => {
    return new Promise((resolve, reject) => {
        $.post(
            {
                url: `https://testflight.apple.com/v3/accounts/${headers['X-Session-Id']}/ru/${app_id}/accept`,
                headers
            },
            (error, response, data) => {
                if (!error && response.status === 200) {
                    const jsonBody = $.toObj(data)
                    if (!jsonBody) {
                        return reject(`${app_id} Yêu cầu tham gia phản hồi phân tích thất bại: ${data}`)
                    }
                    resolve(`🎉 Tham gia thành công ${jsonBody.data.name}`)
                } else if (response.status === 409 || response.status === 429) {
                    resolve(`${app_id} Đã đầy hoặc bị hạn chế, bỏ qua`)
                } else if (response.status === 401) {
                    resolve('header_not_valid')
                } else if (response.status === 404) {
                    resolve('app_not_exist')
                } else {
                    reject(`${app_id} Tham gia thất bại: ${error || `Trạng thái ${response.status}`}`)
                }
            }
        )
    })
}

;(async () => {
    if ($.isRequest()) return getParams()
    if (HeadersList.length === 0) return $.msg('Thiếu headers', 'Vui lòng lấy headers trước')
    if (HeadersList.length < 12 * APP_IDS.length) {
        return $.msg('Thiếu headers', 'Vui lòng lấy thêm headers để đảm bảo đủ 12 headers cho mỗi app_id')
    }

    const noJoinExists = APP_IDS.some((app_id) => app_id.split('#')[1] === '0')
    if (!noJoinExists) return $.log('Không có APP_ID cần tham gia')

    const now = Date.now();
    const interval = 6 * 60 * 1000; // 6 phút

    for (let app_id of APP_IDS) {
        const [appId, status] = app_id.split('#')
        if (status === '0') {
            const lastCheck = LAST_CHECK_TIMES[appId] || 0;
            if (now - lastCheck < interval) {
                $.log(`${appId} Đã kiểm tra gần đây, bỏ qua`)
                continue;
            }

            LAST_CHECK_TIMES[appId] = now;
            $.setdata(JSON.stringify(LAST_CHECK_TIMES), 'tf_last_check_times');

            let headerIndex = 0;
            let result;
            while (headerIndex < HeadersList.length) {
                const headers = HeadersList[headerIndex];
                const lastUse = LAST_HEADER_USE[headerIndex] || 0;
                if (now - lastUse < interval) {
                    headerIndex++;
                    continue;
                }
                result = await TF_Join(appId, headers)
                if (result === 'header_not_valid') {
                    headerIndex++;
                } else if (result === 'app_not_exist') {
                    APP_IDS.splice(inArray(app_id), 1)
                    $.setdata(APP_IDS.join(','), 'tf_app_ids')
                    break;
                } else {
                    $.log(result)
                    if (result.includes('Tham gia thành công')) {
                        APP_IDS[APP_IDS.indexOf(app_id)] = `${app_id.replace('#0', '#1')}`
                        $.setdata(APP_IDS.join(','), 'tf_app_ids')
                    }
                    LAST_HEADER_USE[headerIndex] = now;
                    $.setdata(JSON.stringify(LAST_HEADER_USE), 'tf_last_header_use')
                    break;
                }
            }

            $.log('================================')
            $.log(appId + ' Thực thi hoàn tất')
            $.log('================================')
        } else {
            $.log(`${appId} Đã tham gia, bỏ qua`)
            $.log('================================')
        }
    }
})()
    .catch((e) => $.log('', `❗️${$.name}, Lỗi!`, e))
    .finally(() => $.done({}))
