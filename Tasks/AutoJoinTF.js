const $ = new Env('𝐓𝐞𝐬𝐭𝐅𝐥𝐢𝐠𝐡𝐭自动加入') //13:03
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
        $.msg($.name, 'Lấy tham số TF thành công', 
            `session_id: ${session_id}\nsession_digest: ${session_digest}\nrequest_id: ${request_id}\nkey: ${key}\nSố lượng Headers: ${HeadersList.length}\nSố lượng APP_ID: ${APP_IDS.length}`)
    } else if (/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/.test(url)) {
        const appIdMatch = url.match(/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/)
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1]
            handler(appId)
        } else {
            $.log('Không bắt được APP_ID của TestFlight')
        }
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
