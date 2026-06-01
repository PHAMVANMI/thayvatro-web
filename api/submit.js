const crypto = require('crypto');

export default async function handler(req, res) {
    // Vercel API chỉ nhận lệnh Gửi dữ liệu (POST)
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { studentName, studentCode, correctCount, totalScore, roomRecordName } = req.body;

    const container = 'iCloud.com.mipham.testeduviet';
    const environment = 'development'; // Lưu ý: Nếu App của bạn lên Production, hãy đổi chữ này thành 'production'
    const keyID = process.env.CLOUDKIT_KEY_ID;
    let privateKey = process.env.CLOUDKIT_PRIVATE_KEY;

    // Sửa lỗi xuống dòng của Vercel
    if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

    const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const path = `/database/1/${container}/${environment}/public/records/modify`;

    // Cấu trúc dữ liệu "GamePlayer" khớp chuẩn 100% với App iOS của bạn
    const payload = {
        operations: [
            {
                operationType: 'create',
                record: {
                    recordType: 'GamePlayer',
                    fields: {
                        roomReference: { value: { recordName: roomRecordName, action: 'DELETE_SELF' }, type: 'REFERENCE' },
                        studentName: { value: studentName },
                        studentCode: { value: studentCode },
                        status: { value: 'approved' }, // Đặt approved để nhảy điểm thẳng lên máy Giáo viên
                        totalScore: { value: totalScore },
                        correctCount: { value: correctCount },
                        isGroup: { value: 0 },
                        deviceAccountID: { value: 'VERCEL_WEB_API' }
                    }
                }
            }
        ]
    };

    const body = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(body).digest('base64');
    const message = `${date}:${hash}:${path}`;
    
    // Ký số bảo mật bằng chuẩn ECDSA của Apple
    const signature = crypto.createSign('sha256').update(message).sign(privateKey, 'base64');

    try {
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
        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
