const crypto = require('crypto');

module.exports = async function(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });

    try {
        const { studentName, studentCode, correctCount, totalScore, roomRecordName } = req.body;
        const container = 'iCloud.com.mipham.testeduviet';
        const environment = 'development';
        const keyID = process.env.CLOUDKIT_KEY_ID;
        let privateKey = process.env.CLOUDKIT_PRIVATE_KEY;

        if (!keyID || !privateKey) {
            return res.status(500).json({ error: "Thiếu biến môi trường CLOUDKIT_KEY_ID hoặc PRIVATE_KEY" });
        }

        // 🌟 THUẬT TOÁN ĐỊNH DẠNG LẠI CHÌA KHÓA BẤT BẠI (BULLTPROOF)
        // 1. Xóa bỏ tất cả các tiêu đề (BEGIN/END) cũ và mọi khoảng trắng/xuống dòng bị lỗi
        let rawKey = privateKey.replace(/-----.*?-----/g, '').replace(/\s+/g, '');
        // 2. Cắt lại lõi chìa khóa thành từng dòng 64 ký tự chuẩn chỉnh
        let chunks = rawKey.match(/.{1,64}/g).join('\n');
        // 3. Bọc lại bằng chuẩn EC PRIVATE KEY chính xác của Apple
        let formattedPrivateKey = `-----BEGIN EC PRIVATE KEY-----\n${chunks}\n-----END EC PRIVATE KEY-----`;

        const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const path = `/database/1/${container}/${environment}/public/records/modify`;
        const recordName = crypto.randomUUID();

        const payload = {
            operations: [{
                operationType: 'create',
                record: {
                    recordName: recordName,
                    recordType: 'GamePlayer',
                    fields: {
                        roomReference: { value: { recordName: roomRecordName, action: 'DELETE_SELF' }, type: 'REFERENCE' },
                        studentName: { value: studentName, type: 'STRING' },
                        studentCode: { value: studentCode, type: 'STRING' },
                        status: { value: 'approved', type: 'STRING' },
                        totalScore: { value: totalScore, type: 'DOUBLE' },
                        correctCount: { value: correctCount, type: 'INT64' },
                        isGroup: { value: 0, type: 'INT64' },
                        deviceAccountID: { value: 'VERCEL_WEB_API', type: 'STRING' }
                    }
                }
            }]
        };

        const body = JSON.stringify(payload);
        const hash = crypto.createHash('sha256').update(body).digest('base64');
        const message = `${date}:${hash}:${path}`;
        
        // Ký chữ ký số bằng chìa khóa đã bọc lại
        const signature = crypto.createSign('sha256').update(message).sign(formattedPrivateKey, 'base64');

        const response = await fetch(`https://api.apple-cloudkit.com${path}`, {
            method: 'POST',
            headers: {
                'X-Apple-CloudKit-Request-KeyID': keyID,
                'X-Apple-CloudKit-Request-ISO8601Date': date,
                'X-Apple-CloudKit-Request-SignatureV1': signature,
                'Content-Type': 'application/json'
            },
            body: body
        });

        const dataText = await response.text();
        let data;
        try { data = JSON.parse(dataText); } catch(e) { data = { raw: dataText }; }

        if (!response.ok) {
            return res.status(response.status).json({ error: "Apple Error", details: data });
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: "Vercel Crash", message: error.message, stack: error.stack });
    }
};
