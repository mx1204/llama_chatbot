import dotenv from 'dotenv';

dotenv.config();

export async function* getStreamingResponse(messages, model, temperature = 0.7, maxTokens = 1024) {
    let modelId = model || process.env.GROQ_MODEL || 'llama-4-scout-17b-16e-instruct';
    
    // Use the model ID as-is. Groq expects the full path for certain models like Llama 4.

    const SYSTEM_PROMPT = `You are a helpful AI assistant.
Always format your responses using markdown:
- Use **bold** for important terms and key points
- Use ## for main section headings
- Use ### for sub headings
- Use bullet points for lists
- Use numbered lists for step by step instructions
- Use code blocks for any code examples
Write naturally and never mention, explain,
or show markdown syntax to the user.
Just use it silently to format your response.`;

    try {
        const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...messages
                    ],
                    max_tokens: maxTokens,
                    temperature: temperature,
                    stream: true,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API Error (${response.status}): ${errorText}`);
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
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmedLine.slice(6));
                        const content = json.choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) {
                        console.error('Error parsing streaming JSON:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Groq Inference Error:', error);
        yield `Error: ${error.message}`;
    }
}
