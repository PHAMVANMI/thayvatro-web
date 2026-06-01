const crypto = require('crypto');

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });

    try {
        const { studentName, studentCode, correctCount, totalScore, roomRecordName } = req.body;

        const container = 'iCloud.com.mipham.testeduviet';
        const environment = 'development'; // Đảm bảo đúng môi trường Development
        const keyID = process.env.CLOUDKIT_KEY_ID;
        let privateKey = process.env.CLOUDKIT_PRIVATE_KEY;

        if (!keyID || !privateKey) {
            return res.status(500).json({ error: "Vercel thiếu biến môi trường CLOUDKIT_KEY_ID hoặc PRIVATE_KEY" });
        }

        // Đảm bảo Private Key đúng định dạng xuống dòng chuẩn PEM
        privateKey = privateKey.replace(/\\n/g, '\n');
        
        const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        const path = `/database/1/${container}/${environment}/public/records/modify`;
        
        // BẮT BUỘC CỦA APPLE: Tự sinh ID ngẫu nhiên cho bản ghi nộp bài
        const recordName = crypto.randomUUID();

        // Định dạng payload siêu chặt chẽ kèm TYPE để không bị lỗi Schema
        const payload = {
            operations: [
                {
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
                }
            ]
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

        const data = await response.json();

        if (!response.ok) {
            // Ném thẳng lỗi của Apple ra ngoài để Web hiển thị
            return res.status(response.status).json({ error: "Apple Error: " + JSON.stringify(data) });
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: "Server Vercel Error: " + error.message });
    }
}
