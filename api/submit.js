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

        // 🌟 THUẬT TOÁN TỰ ĐỘNG SỬA ĐỊNH DẠNG CHÌA KHÓA BỊ VERCEL LÀM HỎNG
        privateKey = privateKey.replace(/\\n/g, '\n');
        if (!privateKey.includes('\n')) {
            const match = privateKey.match(/-----BEGIN PRIVATE KEY-----\s*(.*?)\s*-----END PRIVATE KEY-----/);
            if (match) {
                const base64Str = match[1].replace(/\s+/g, '');
                // Cắt chuỗi thành từng dòng 64 ký tự chuẩn Apple
                const chunks = base64Str.match(/.{1,64}/g).join('\n');
                privateKey = `-----BEGIN PRIVATE KEY-----\n${chunks}\n-----END PRIVATE KEY-----`;
            }
        }

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
        const signature = crypto.createSign('sha256').update(message).sign(privateKey, 'base64');

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
