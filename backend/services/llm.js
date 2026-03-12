import dotenv from 'dotenv';

dotenv.config();

export async function* getStreamingResponse(messages, model, temperature = 0.7, maxTokens = 1024) {
    const modelId = model || process.env.HF_MODEL || 'meta-llama/Llama-3.2-3B-Instruct';

    try {
        const response = await fetch(
            'https://router.huggingface.co/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.HF_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: `${modelId}:hf-inference`,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature,
                    stream: true,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HF API Error (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.slice(6));
                        const content = json.choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) {
                        console.error('Error parsing streaming JSON:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('HF Inference Error:', error);
        yield `Error: ${error.message}`;
    }
}
