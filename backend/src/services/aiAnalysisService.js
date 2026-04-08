const OpenAI = require('openai');
const fs = require('fs');

const client = new OpenAI({
    apiKey: process.env.ARK_API_KEY,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
});

const SYSTEM_PROMPT = `你是一名专业的民航飞机检修工程师助手，具备丰富的航空维修知识。
用户会上传飞机部件或机身的检修照片，你需要：
1. 首先在回答的第一行输出判断结论，格式严格为 <正常> 或 <异常>，不得有其他内容
2. 从第二行开始，判断是否存在明显故障、损伤或异常（如裂纹、腐蚀、变形、磨损、污染等）
3. 如发现异常，给出具体的检修建议，包括参考的维修手册章节（AMM）
4. 评估故障严重程度（轻微/中等/严重）
不需要'#','##'等格式化符号，纯文本直接给出分析结果和建议。
请用中文回答，语言专业简洁。`;

async function analyzeImage(imagePath, originalFilename, yoloResult = null) {
    if (!process.env.ARK_API_KEY || !process.env.ARK_MODEL_ID) {
        throw new Error('AI 服务未配置，请检查 ARK_API_KEY 和 ARK_MODEL_ID 环境变量');
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = (originalFilename || 'image.jpg').split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', bmp: 'bmp', webp: 'webp' };
    const mimeType = `image/${mimeMap[ext] || 'jpeg'}`;

    let userText = '请分析这张飞机检修照片，第一行输出 <正常> 或 <异常>，然后给出详细分析和检修建议。';
    if (yoloResult) {
        const status = yoloResult.is_normal ? '正常' : '异常';
        userText += `\n（YOLO初步检测结果：${status}，置信度 ${(yoloResult.confidence * 100).toFixed(1)}%，请结合图片给出更详细的分析）`;
    }

    try {
        const response = await client.chat.completions.create({
            model: process.env.ARK_MODEL_ID,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64Image}` },
                        },
                        { type: 'text', text: userText },
                    ],
                },
            ],
            max_tokens: 1024,
        });

        const raw = response.choices[0].message.content || '';

        // 解析第一行的 <正常> 或 <异常> 标签
        const firstLine = raw.split('\n')[0].trim();
        let aiVerdict = null;
        let analysisBody = raw;

        if (firstLine === '<正常>') {
            aiVerdict = 'normal';
            analysisBody = raw.replace(/^<正常>\s*\n?/, '').trim();
        } else if (firstLine === '<异常>') {
            aiVerdict = 'abnormal';
            analysisBody = raw.replace(/^<异常>\s*\n?/, '').trim();
        }

        return {
            filename: originalFilename,
            aiVerdict,       // 'normal' | 'abnormal' | null
            analysis: analysisBody,
            yoloResult: yoloResult || null,
        };
    } catch (err) {
        console.error('[aiAnalysisService] HTTP status:', err.status);
        console.error('[aiAnalysisService] message:', err.message);
        console.error('[aiAnalysisService] error body:', JSON.stringify(err.error));
        throw new Error(err.error?.message || err.message || 'AI 分析失败');
    }
}

module.exports = { analyzeImage };
