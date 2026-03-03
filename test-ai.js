import axios from 'axios';

// 从配置文件读取
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config.json', 'utf-8'));
const aiConfig = config.aiConfig;

console.log('=== AI 连接测试 ===\n');
console.log('Provider:', aiConfig.provider);
console.log('Model:', aiConfig.model);
console.log('Base URL:', aiConfig.baseUrl);
console.log('API Key prefix:', aiConfig.apiKey?.substring(0, 15) + '...\n');

const cleanBaseUrl = aiConfig.baseUrl.endsWith('/') ? aiConfig.baseUrl.slice(0, -1) : aiConfig.baseUrl;
const url = `${cleanBaseUrl}/chat/completions`;

const requestBody = {
    model: aiConfig.model,
    messages: [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": '请回复 "连接测试成功"，不要说其他内容。'}
    ],
    max_tokens: 100
};

console.log('Request URL:', url);
console.log('Request headers:', {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${aiConfig.apiKey?.substring(0, 10)}...`
});
console.log('Request body:', JSON.stringify(requestBody, null, 2) + '\n');

try {
    const response = await axios.post(url, requestBody, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        timeout: 30000
    });

    console.log('✅ 测试成功!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
} catch (error) {
    console.error('❌ 测试失败!');
    console.error('Status:', error.response?.status);
    console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Request config:', {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
    });
}
